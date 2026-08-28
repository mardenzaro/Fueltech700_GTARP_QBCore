-- ── 3D Map Defaults ──────────────────────────────────────────────────────────
local DEF_IGN_3D = {
    { 8, 12, 18, 24, 28, 30, 32, 32, 30},  -- 100% carga
    {10, 14, 20, 26, 30, 32, 34, 34, 32},  -- 80%
    {12, 16, 22, 28, 32, 34, 36, 36, 34},  -- 60%
    {14, 18, 24, 30, 34, 36, 38, 38, 36},  -- 40%
    {16, 20, 26, 32, 36, 38, 40, 40, 38},  -- 20%
    {18, 22, 28, 34, 38, 40, 42, 42, 40},  -- 0%
}

local DEF_INJ_3D = {
    {15, 18, 20, 22, 24, 25, 25, 23, 20},  -- 100% carga
    { 8, 10, 12, 15, 18, 20, 20, 18, 15},  -- 80%
    { 0,  2,  5,  8, 12, 15, 15, 12, 10},  -- 60%
    {-5, -3,  0,  3,  6,  8,  8,  6,  3},  -- 40%
    {-10,-8, -5, -2,  0,  2,  2,  0, -3},  -- 20%
    {-15,-12,-10, -8, -5, -2, -2, -5, -8}, -- 0%
}

local RPM_COLS = {500, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000}

-- ── Helpers ───────────────────────────────────────────────────────────────────
local function deepCopy(t)
    local c = {}
    for i, row in ipairs(t) do
        c[i] = {}
        for j, v in ipairs(row) do c[i][j] = v end
    end
    return c
end

-- ── ECU Banks (A / B) ─────────────────────────────────────────────────────────
local banks = {
    A = { ign = nil, inj = nil },
    B = { ign = nil, inj = nil },
}
local activeBank   = 'A'
local ecuIgnOffset = 0
local ecuInjOffset = 0

local function getActiveGrid(kind)
    return banks[activeBank][kind] or (kind == 'ign' and DEF_IGN_3D or DEF_INJ_3D)
end

-- ── Alert Flags ───────────────────────────────────────────────────────────────
local alertDetonacao   = false
local alertBaixaComb   = false
local alertBaixaOleo   = false
local alertInjetor     = false
local alertFaltaComb   = false
local alertExcessoComb = false

-- ── Control Parameters ────────────────────────────────────────────────────────
local twoStepRPM      = 4000
local twoStepActive   = false
local cutOffEnabled   = false
local delayCorteGiro  = 500
local shiftLightRPM   = 7500
local boostTargetPSI  = 14
local boostRampRPM    = 2500
local boostActive     = false
local tractionSlip    = 25
local tractionEnabled = false
local revLimit        = 8000

-- ── Top Speed ─────────────────────────────────────────────────────────────────
local baseMaxFlatVel  = nil
local baseDragCoeff   = nil
local topSpeedDirty   = false


-- ── O2 Closed Loop ────────────────────────────────────────────────────────────
local closedLoopActive = false
local closedLoopRate   = 1   -- unidades por ciclo de 500 ms
local clTimer          = 0

-- ── Runtime ───────────────────────────────────────────────────────────────────
local isInVehicle = false
local lastVehicle = 0
local oilTemp     = 20.0
local airTemp     = 25.0
local odometer    = 0.0
local tripOdo     = 0.0
local cutOffTimer = 0

-- ── Shift / BOV ───────────────────────────────────────────────────────────────
local lastGear = 0
local bovTimer = 0

-- ── Manual Transmission ───────────────────────────────────────────────────────
local manualActive = false
local manualGear   = 1

RegisterKeyMapping('shiftup',   'Subir Marcha (Manual)',  'keyboard', 'PAGEUP')
RegisterKeyMapping('shiftdown', 'Descer Marcha (Manual)', 'keyboard', 'PAGEDOWN')

RegisterCommand('mt', function()
    local veh = GetVehiclePedIsIn(PlayerPedId(), false)
    if veh == 0 then
        TriggerEvent('chat:addMessage', { args = {'FT700', 'Entre em um veículo primeiro.'} })
        return
    end
    manualActive = not manualActive
    if manualActive then
        manualGear = math.max(1, GetVehicleCurrentGear(veh))
        TriggerEvent('chat:addMessage', { args = {'FT700', 'Marcha Manual ATIVA — Marcha ' .. manualGear} })
    else
        TriggerEvent('chat:addMessage', { args = {'FT700', 'Marcha Manual DESATIVADA'} })
    end
    SendNUIMessage({ manualMode = manualActive, manualGear = manualGear })
end, false)

RegisterCommand('shiftup', function()
    if not manualActive then return end
    local veh = GetVehiclePedIsIn(PlayerPedId(), false)
    if veh == 0 then return end
    manualGear = math.min(GetVehicleHighGear(veh), manualGear + 1)
    SendNUIMessage({ manualMode = true, manualGear = manualGear })
end, false)

RegisterCommand('shiftdown', function()
    if not manualActive then return end
    if manualGear > 1 then
        manualGear = manualGear - 1
        SendNUIMessage({ manualMode = true, manualGear = manualGear })
    end
end, false)

-- ── Drag Timer ────────────────────────────────────────────────────────────────
local dragActive    = false
local dragStartTime = 0
local dragStartPos  = nil
local drag60Done    = false
local drag100Done   = false
local drag402Done   = false
local dragResults   = {}
local wasTwoStep    = false

-- ── Zone lookup ───────────────────────────────────────────────────────────────
local function getZones(rpmVal, throttleVal)
    local ri = 1
    for i = 1, #RPM_COLS do
        if rpmVal >= RPM_COLS[i] then ri = i end
    end
    ri = math.max(1, math.min(#RPM_COLS, ri))

    local pct = throttleVal * 100
    local li
    if     pct >= 90 then li = 1
    elseif pct >= 70 then li = 2
    elseif pct >= 50 then li = 3
    elseif pct >= 30 then li = 4
    elseif pct >= 10 then li = 5
    else                   li = 6 end

    return li, ri
end

-- ── Power multiplier ─────────────────────────────────────────────────────────
local function calcPower(rpmVal, throttleVal)
    local li, ri = getZones(rpmVal, throttleVal)

    local ignGrid = getActiveGrid('ign')
    local injGrid = getActiveGrid('inj')

    local ignVal = (ignGrid[li] and ignGrid[li][ri]) or DEF_IGN_3D[li][ri]
    local injVal = (injGrid[li] and injGrid[li][ri]) or DEF_INJ_3D[li][ri]
    local ignDev = (ignVal + ecuIgnOffset) - DEF_IGN_3D[li][ri]
    local injDev = (injVal + ecuInjOffset) - DEF_INJ_3D[li][ri]

    local ignEff = 1.0 + math.max(-0.15, math.min(0.10, ignDev * 0.005))
    local injEff = 1.0 + math.max(-0.10, math.min(0.10, injDev * 0.003))

    local boostEff = 1.0
    if boostActive then
        local ramp = math.min(1.0, math.max(0.0, (rpmVal - boostRampRPM) / 800.0))
        local boostBar = boostTargetPSI / 14.504
        boostEff = 1.0 + ramp * boostBar * 0.55
    end

    return math.max(0.3, math.min(6.0, ignEff * injEff * boostEff)), li, ri
end

-- ── Top Speed aplicador ───────────────────────────────────────────────────────
local function applyTopSpeed(vehicle)
    if not baseMaxFlatVel or not vehicle or vehicle == 0 then return end

    -- Fator 1: Rev limiter — domina top speed em top gear (base = 6500 RPM)
    local revFactor = revLimit / 8000.0

    -- Fator 2: Avanço de ignição nos RPMs altos (linhas 100%/80% carga, cols 6k-8k)
    local ignGrid = getActiveGrid('ign')
    local ignSum, ignCount = 0, 0
    for li = 1, 2 do
        for ci = 7, 9 do
            ignSum   = ignSum + (ignGrid[li][ci] or DEF_IGN_3D[li][ci])
            ignCount = ignCount + 1
        end
    end
    local ignAvg    = ignCount > 0 and (ignSum / ignCount) or 32.0
    local ignFactor = 1.0 + (ignAvg - 32.0) * 0.008  -- cada grau acima de 32° = +0.8%

    -- Fator 3: Boost (domina em carros turbo — 1.0 bar ≈ +55% potência)
    local boostBar    = boostTargetPSI / 14.504
    local boostFactor = boostActive and (1.0 + boostBar * 0.55) or 1.0

    local topMult = math.max(0.5, math.min(4.0, revFactor * ignFactor * boostFactor))

    -- 1) Handling: eleva o teto de velocidade do motor
    SetVehicleHandlingFloat(vehicle, 'CHandlingData', 'fInitialDriveMaxFlatVel', baseMaxFlatVel * topMult)

    -- 2) MaxSpeed: sobrepõe limite de marchas (em m/s)
    local baseKmh = baseMaxFlatVel
    if baseKmh < 80 then baseKmh = 180 end
    SetVehicleMaxSpeed(vehicle, (baseKmh * topMult) / 3.6)

    -- 3) Drag: reduz arrasto aerodinâmico proporcionalmente ao boost
    --    Sem boost → drag original. Com boost máximo → drag cai até 25% do original.
    if baseDragCoeff then
        local dragMult = math.max(0.25, 1.0 / topMult)
        SetVehicleHandlingFloat(vehicle, 'CHandlingData', 'fDragCoeff', baseDragCoeff * dragMult)
    end
end

-- ── Fogo no escapamento ──────────────────────────────────────────────────────
local function spawnExhaustFire(veh)
    if not HasNamedPtfxAssetLoaded("core") then return end
    local bones = { "exhaust_1", "exhaust_2", "exhaust_3", "exhaust_4", "exhaust" }
    local fired = false
    for _, boneName in ipairs(bones) do
        local idx = GetEntityBoneIndexByName(veh, boneName)
        if idx ~= -1 then
            local bonePos = GetWorldPositionOfEntityBone(veh, idx)
            UseParticleFxAssetNextCall("core")
            StartParticleFxNonLoopedAtCoord(
                "fire_med_x1",
                bonePos.x, bonePos.y, bonePos.z,
                0.0, 0.0, 0.0, 1.8, false, false, false)
            fired = true
        end
    end
    -- fallback: posição atrás do carro
    if not fired then
        local fwd = GetEntityForwardVector(veh)
        local pos = GetEntityCoords(veh)
        UseParticleFxAssetNextCall("core")
        StartParticleFxNonLoopedAtCoord(
            "fire_med_x1",
            pos.x - fwd.x * 2.2, pos.y - fwd.y * 2.2, pos.z + 0.25,
            0.0, 0.0, 0.0, 1.8, false, false, false)
    end
end

-- ── /ft command ───────────────────────────────────────────────────────────────
RegisterCommand('ft', function()
    if GetVehiclePedIsIn(PlayerPedId(), false) == 0 then return end
    SetNuiFocus(true, true)
    SendNUIMessage({
        showMenu = true,
        ecuState = {
            activeBank       = activeBank,
            ignMapA          = banks.A.ign or DEF_IGN_3D,
            injMapA          = banks.A.inj or DEF_INJ_3D,
            ignMapB          = banks.B.ign or deepCopy(DEF_IGN_3D),
            injMapB          = banks.B.inj or deepCopy(DEF_INJ_3D),
            ignOffset        = ecuIgnOffset,
            injOffset        = ecuInjOffset,
            alertDetonacao   = alertDetonacao,
            alertBaixaComb   = alertBaixaComb,
            alertBaixaOleo   = alertBaixaOleo,
            alertInjetor     = alertInjetor,
            alertFaltaComb   = alertFaltaComb,
            alertExcessoComb = alertExcessoComb,
            twoStepRPM       = twoStepRPM,
            twoStepActive    = twoStepActive,
            cutOffEnabled    = cutOffEnabled,
            delayCorteGiro   = delayCorteGiro,
            shiftLightRPM    = shiftLightRPM,
            boostPSI         = boostTargetPSI,
            boostRampRPM     = boostRampRPM,
            boostActive      = boostActive,
            tractionSlip     = tractionSlip,
            tractionEnabled  = tractionEnabled,
            closedLoopActive = closedLoopActive,
            closedLoopRate   = closedLoopRate,
            revLimit         = revLimit,
        }
    })
end, false)

-- ── NUI Callbacks ─────────────────────────────────────────────────────────────
RegisterNUICallback('ecuValues', function(data, cb)
    activeBank            = data.activeBank or 'A'
    banks.A.ign           = data.ignMapA
    banks.A.inj           = data.injMapA
    banks.B.ign           = data.ignMapB
    banks.B.inj           = data.injMapB
    ecuIgnOffset          = tonumber(data.ignOffset)    or 0
    ecuInjOffset          = tonumber(data.injOffset)    or 0
    alertDetonacao        = data.alertDetonacao  == true
    alertBaixaComb        = data.alertBaixaComb  == true
    alertBaixaOleo        = data.alertBaixaOleo  == true
    alertInjetor          = data.alertInjetor    == true
    alertFaltaComb        = data.alertFaltaComb  == true
    alertExcessoComb      = data.alertExcessoComb== true
    twoStepRPM            = tonumber(data.twoStepRPM)    or 4000
    twoStepActive         = data.twoStepActive  == true
    cutOffEnabled         = data.cutOffEnabled  == true
    delayCorteGiro        = tonumber(data.delayCorteGiro) or 500
    shiftLightRPM         = tonumber(data.shiftLightRPM)  or 7500
    boostTargetPSI        = tonumber(data.boostPSI)       or 14
    boostRampRPM          = tonumber(data.boostRampRPM)   or 2500
    boostActive           = data.boostActive    == true
    tractionSlip          = tonumber(data.tractionSlip)   or 25
    tractionEnabled       = data.tractionEnabled== true
    closedLoopActive      = data.closedLoopActive== true
    closedLoopRate        = tonumber(data.closedLoopRate) or 1
    revLimit              = tonumber(data.revLimit) or 8000
    topSpeedDirty         = true
    cb('ok')
end)

RegisterNUICallback('closeMenu', function(_, cb)
    SetNuiFocus(false, false)
    -- Salva configuração no banco ao fechar o menu
    local veh = GetVehiclePedIsIn(PlayerPedId(), false)
    if veh ~= 0 then
        local state = {
            activeBank       = activeBank,
            ignMapA          = banks.A.ign or DEF_IGN_3D,
            injMapA          = banks.A.inj or DEF_INJ_3D,
            ignMapB          = banks.B.ign or DEF_IGN_3D,
            injMapB          = banks.B.inj or DEF_INJ_3D,
            twoStepRPM       = twoStepRPM,
            twoStepActive    = twoStepActive,
            cutOffEnabled    = cutOffEnabled,
            delayCorteGiro   = delayCorteGiro,
            shiftLightRPM    = shiftLightRPM,
            boostPSI         = boostTargetPSI,
            boostRampRPM     = boostRampRPM,
            boostActive      = boostActive,
            tractionSlip     = tractionSlip,
            tractionEnabled  = tractionEnabled,
            closedLoopActive = closedLoopActive,
            closedLoopRate   = closedLoopRate,
            revLimit         = revLimit,
        }
        TriggerServerEvent('fueltech:saveECU', GetEntityModel(veh), json.encode(state))
    end
    cb('ok')
end)

-- ── Recebe configuração carregada do banco ────────────────────────────────────
RegisterNetEvent('fueltech:ecuLoaded', function(settingsJson)
    if not settingsJson then return end
    local ok, data = pcall(json.decode, settingsJson)
    if not ok or not data then return end

    activeBank       = data.activeBank    or 'A'
    banks.A.ign      = data.ignMapA
    banks.A.inj      = data.injMapA
    banks.B.ign      = data.ignMapB
    banks.B.inj      = data.injMapB
    twoStepRPM       = data.twoStepRPM    or 4000
    twoStepActive    = data.twoStepActive == true
    cutOffEnabled    = data.cutOffEnabled == true
    delayCorteGiro   = data.delayCorteGiro or 500
    shiftLightRPM    = data.shiftLightRPM  or 7500
    boostTargetPSI   = data.boostPSI       or 14
    boostRampRPM     = data.boostRampRPM   or 2500
    boostActive      = data.boostActive   == true
    tractionSlip     = data.tractionSlip   or 25
    tractionEnabled  = data.tractionEnabled== true
    closedLoopActive = data.closedLoopActive== true
    closedLoopRate   = data.closedLoopRate  or 1
    revLimit         = data.revLimit        or 8000
    topSpeedDirty    = true
end)


-- ── Main Loop ─────────────────────────────────────────────────────────────────
CreateThread(function()
    StopGameplayCamShaking(true)
    while true do
        local sleep   = 500
        local ped     = PlayerPedId()
        local vehicle = GetVehiclePedIsIn(ped, false)

        if vehicle ~= 0 and not IsEntityDead(ped) then
            sleep       = 100
            lastVehicle = vehicle

            if not isInVehicle then
                isInVehicle  = true
                tripOdo      = 0.0
                cutOffTimer  = 0
                clTimer      = 0
                dragActive   = false
                baseMaxFlatVel  = GetVehicleHandlingFloat(vehicle, 'CHandlingData', 'fInitialDriveMaxFlatVel')
                baseDragCoeff   = GetVehicleHandlingFloat(vehicle, 'CHandlingData', 'fDragCoeff')
                topSpeedDirty   = true
                StopGameplayCamShaking(true)
                SendNUIMessage({ show = true })
                -- Carrega configuração do banco para este modelo de veículo
                local model = GetEntityModel(vehicle)
                TriggerServerEvent('fueltech:loadECU', GetEntityModel(vehicle))
                RequestNamedPtfxAsset("core")
            end

            if topSpeedDirty then
                applyTopSpeed(vehicle)
                topSpeedDirty = false
            end

            local speed        = GetEntitySpeed(vehicle) * 3.6
            local rpm          = GetVehicleCurrentRpm(vehicle)
            local gear         = GetVehicleCurrentGear(vehicle)
            local fuel         = GetVehicleFuelLevel(vehicle)
            local engineHealth = GetVehicleEngineHealth(vehicle) / 1000.0
            local isEngOn      = GetIsVehicleEngineRunning(vehicle)
            local throttle     = GetControlNormal(0, 71)

            local fwd = GetEntityForwardVector(vehicle)
            local vel = GetEntityVelocity(vehicle)
            local gearStr
            if fwd.x * vel.x + fwd.y * vel.y < -2.0 then gearStr = "R"
            elseif gear == 0 then gearStr = "N"
            else gearStr = tostring(gear) end

            if isEngOn then
                oilTemp = math.min(130.0, oilTemp + ((40.0 + rpm * 80.0) - oilTemp) * 0.002)
                airTemp = math.min(72.0,  airTemp + ((25.0 + rpm * 25.0 + throttle * 18.0) - airTemp) * 0.001)
            else
                oilTemp = math.max(20.0, oilTemp - 0.05)
                airTemp = math.max(20.0, airTemp - 0.02)
            end

            local d = speed * 100.0 / 3600000.0
            odometer = odometer + d
            tripOdo  = tripOdo  + d

            local mapVal    = math.max(-1.0, math.min(2.0,  -0.7 + throttle * 1.4 + rpm * 0.5))
            local fuelPres  = math.max(2.5,  math.min(4.5,   2.8 + throttle * 1.2 + rpm * 0.3))
            local oilPres   = math.max(0.8,  math.min(6.5,   1.2 + rpm * 5.5))
            local injection = math.max(3.0,  math.min(98.0,  4.0 + throttle * 75.0 + rpm * 15.0))
            local lambda    = math.max(0.78, math.min(1.15,  1.02 - throttle * 0.12 - rpm * 0.04))
            local ignTiming = math.max(-35.0,math.min(3.0,  -28.0 + rpm * 10.0 - throttle * 6.0))

            local rpmVal = rpm * 8000
            local pMult, li, ri = calcPower(rpmVal, throttle)

            -- ── Manual Transmission + Limites por Marcha ─────────────────────
            -- Sem SetVehicleMaxSpeed — só pMult para não criar parede rígida
            local GEAR_RATIO = { 0.16, 0.30, 0.48, 0.66, 0.82, 1.0, 1.0, 1.0 }
            local nearRedline = false

            if manualActive then
                SetVehicleCurrentGear(vehicle, manualGear)
                gearStr = 'M' .. manualGear

                local baseKmh  = baseMaxFlatVel or 180
                if baseKmh < 80 then baseKmh = 180 end
                local boostBar = boostTargetPSI / 14.504
                local bFactor  = boostActive and (1.0 + boostBar * 0.55) or 1.0
                local rFactor  = revLimit / 8000.0
                local topKmh   = baseKmh * rFactor * bFactor

                local ratio  = GEAR_RATIO[math.min(manualGear, #GEAR_RATIO)]
                local capKmh = topKmh * ratio

                -- Redline: corte suave de potência (sem parede — o carro ainda rola)
                local capPct = speed / math.max(1.0, capKmh)
                if capPct > 0.85 then
                    nearRedline = true
                    local cut = math.min(1.0, (capPct - 0.85) / 0.15)
                    pMult = pMult * math.max(0.08, 1.0 - cut * 0.92)
                end

                SendNUIMessage({ manualRedline = nearRedline, manualCapPct = capPct })
            end

            -- ── Detecção de troca de marcha (BOV + fogo no escapamento) ──────────
            local trackGear = manualActive and manualGear or gear
            if trackGear ~= lastGear and trackGear > 0 and lastGear > 0 and throttle > 0.5 then
                spawnExhaustFire(vehicle)
                -- BOV só na subida de marcha (upshift)
                if boostActive and trackGear > lastGear then
                    bovTimer = 280
                    SendNUIMessage({ turboBOV = true })
                end
            end
            lastGear = trackGear

            -- ── O2 Closed Loop ────────────────────────────────────────────────
            if closedLoopActive and isEngOn and throttle > 0.1 then
                clTimer = clTimer + 100
                if clTimer >= 500 then
                    clTimer = 0
                    if not banks[activeBank].inj then
                        banks[activeBank].inj = deepCopy(DEF_INJ_3D)
                    end
                    local injGrid = banks[activeBank].inj
                    local cell    = injGrid[li][ri]
                    if lambda > 1.02 then                               -- magra → mais combustível
                        injGrid[li][ri] = math.min(30, cell + closedLoopRate)
                    elseif lambda < 0.98 then                           -- rica → menos combustível
                        injGrid[li][ri] = math.max(-30, cell - closedLoopRate)
                    end
                    SendNUIMessage({
                        clUpdate   = true,
                        activeBank = activeBank,
                        injMap     = injGrid,
                    })
                end
            else
                clTimer = 0
            end

            -- ── Drag Timer ────────────────────────────────────────────────────
            local isTwoStep = twoStepActive and IsControlPressed(0, 72) and throttle > 0.8

            -- Detecta largada: 2-step ativo + freio solto + acelerador fundo
            if wasTwoStep and not isTwoStep and twoStepActive and throttle > 0.5 and speed < 10 then
                dragActive    = true
                dragStartTime = GetGameTimer()
                dragStartPos  = GetEntityCoords(vehicle)
                drag60Done    = false
                drag100Done   = false
                drag402Done   = false
                dragResults   = {}
                SendNUIMessage({ dragStart = true })
            end
            wasTwoStep = isTwoStep

            if dragActive then
                local elapsed = (GetGameTimer() - dragStartTime) / 1000.0
                local dist    = dragStartPos and #(GetEntityCoords(vehicle) - dragStartPos) or 0

                if not drag60Done  and speed >= 60  then
                    drag60Done = true; dragResults.t60 = elapsed
                end
                if not drag100Done and speed >= 100 then
                    drag100Done = true; dragResults.t100 = elapsed
                end
                if not drag402Done and dist >= 402 then
                    drag402Done        = true
                    dragResults.t402  = elapsed
                    dragResults.speed = math.floor(speed)
                    dragActive        = false
                    SendNUIMessage({
                        dragSlip = true,
                        t60      = dragResults.t60  and string.format("%.3f", dragResults.t60)  or "---",
                        t100     = dragResults.t100 and string.format("%.3f", dragResults.t100) or "---",
                        t402     = string.format("%.3f", dragResults.t402),
                        trapSpd  = dragResults.speed,
                    })
                end

                -- Aborta se parar após 2s de corrida
                if speed < 2 and elapsed > 2 then
                    dragActive = false
                    SendNUIMessage({ dragAbort = true })
                end
            end

            -- ── Traction control ──────────────────────────────────────────────
            local isSpinning = throttle > 0.8 and speed < (tractionSlip * 0.4) and rpm > 0.65 and gear <= 2
            if tractionEnabled and isSpinning then pMult = pMult * 0.3 end

            -- ── Rev Limiter / 2-Step / Cut-Off / Normal ──────────────────────
            if rpmVal >= revLimit and throttle > 0.1 and not isTwoStep then
                SetVehicleEnginePowerMultiplier(vehicle, 0.01)
                SetVehicleEngineTorqueMultiplier(vehicle, 0.01)
            elseif isTwoStep and rpmVal > twoStepRPM then
                SetVehicleEnginePowerMultiplier(vehicle, 0.01)
                SetVehicleEngineTorqueMultiplier(vehicle, 0.01)
            elseif cutOffEnabled and throttle < 0.05 and speed > 20 then
                cutOffTimer = cutOffTimer + 100
                if cutOffTimer >= delayCorteGiro then
                    SetVehicleEnginePowerMultiplier(vehicle, 0.05)
                    SetVehicleEngineTorqueMultiplier(vehicle, 0.05)
                else
                    SetVehicleEnginePowerMultiplier(vehicle, pMult)
                    SetVehicleEngineTorqueMultiplier(vehicle, pMult * 0.9)
                end
            else
                cutOffTimer = 0
                SetVehicleEnginePowerMultiplier(vehicle, pMult)
                SetVehicleEngineTorqueMultiplier(vehicle, pMult * 0.9)
            end

            -- ── BOV na troca de marcha ───────────────────────────────────────
            if bovTimer > 0 then
                bovTimer = bovTimer - 100
            end

            local shiftLight = rpmVal >= shiftLightRPM

            local spoolPct = 0.0
            if boostActive and boostTargetPSI >= 5 and rpmVal >= 500 then
                spoolPct = math.max(0.0, math.min(1.0, (rpmVal - 500) / math.max(1, boostRampRPM - 500)))
            end

            -- ── Alerts ────────────────────────────────────────────────────────
            local alerts = {}
            if alertDetonacao   and rpmVal > 7000 and throttle > 0.9 then alerts[#alerts+1] = 'PRÉ DETONAÇÃO'  end
            if alertBaixaOleo   and oilPres  < 1.8                   then alerts[#alerts+1] = 'BAIXA P.ÓLEO'   end
            if alertBaixaComb   and fuel      < 20                    then alerts[#alerts+1] = 'BAIXA P.COMB'   end
            if alertFaltaComb   and fuel      < 8                    then alerts[#alerts+1] = 'FALTA COMBUST.' end
            if alertExcessoComb and injection > 82                   then alerts[#alerts+1] = 'EXCESSO COMB.'  end
            if alertInjetor     and injection > 90                   then alerts[#alerts+1] = 'INJETOR ABERTO' end
            if closedLoopActive                                       then alerts[#alerts+1] = 'O2 LOOP '..activeBank end

            SendNUIMessage({
                update       = true,
                speed        = math.floor(speed),
                rpm          = math.floor(rpmVal),
                rpmNorm      = rpm,
                gear         = gearStr,
                fuel         = fuel,
                oilTemp      = string.format("%.1f", oilTemp),
                airTemp      = string.format("%.1f", airTemp),
                map          = string.format("%.2f", mapVal),
                ignTiming    = string.format("%.1f", ignTiming),
                fuelPressure = string.format("%.2f", fuelPres),
                oilPressure  = string.format("%.2f", oilPres),
                injection    = string.format("%.1f", injection),
                lambda       = string.format("%.2f", lambda),
                odometer     = odometer,
                tripOdo      = tripOdo,
                throttlePct  = math.floor(throttle * 100),
                engineHealth = engineHealth,
                shiftLight   = shiftLight,
                isTwoStep    = isTwoStep,
                alerts       = alerts,
                activeRow    = li,
                activeCol    = ri,
                boostOn      = boostActive,
                boostPSI     = boostTargetPSI,
                spoolPct     = spoolPct,
                activeBank   = activeBank,
                manualMode   = manualActive,
                manualGear   = manualActive and manualGear or nil,
            })
        else
            if isInVehicle then
                isInVehicle = false
                cutOffTimer = 0
                clTimer     = 0
                dragActive  = false
                wasTwoStep  = false
                if lastVehicle ~= 0 then
                    SetVehicleEnginePowerMultiplier(lastVehicle, 1.0)
                    SetVehicleEngineTorqueMultiplier(lastVehicle, 1.0)
                    if baseMaxFlatVel then
                        SetVehicleHandlingFloat(lastVehicle, 'CHandlingData', 'fInitialDriveMaxFlatVel', baseMaxFlatVel)
                        SetVehicleMaxSpeed(lastVehicle, 0.0)
                    end
                    if baseDragCoeff then
                        SetVehicleHandlingFloat(lastVehicle, 'CHandlingData', 'fDragCoeff', baseDragCoeff)
                    end
                end
                baseMaxFlatVel  = nil
                baseDragCoeff   = nil
                topSpeedDirty   = false
                manualActive    = false
                manualGear      = 1
                lastGear        = 0
                bovTimer        = 0
                StopGameplayCamShaking(true)
                SendNUIMessage({ show = false, manualMode = false, manualGear = 1 })
            end
        end

        Wait(sleep)
    end
end)
