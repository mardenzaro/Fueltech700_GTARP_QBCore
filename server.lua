-- ── fueltech_speedometer / server.lua ────────────────────────────────────────
-- Persiste configurações do ECU por jogador + modelo de veículo no banco de dados

local function getIdentifier(src)
    for i = 0, GetNumPlayerIdentifiers(src) - 1 do
        local id = GetPlayerIdentifier(src, i)
        if id and id:sub(1, 8) == 'license:' then return id end
    end
    return 'license:' .. GetPlayerIdentifier(src, 0)
end

-- ── Criar tabela se não existir ───────────────────────────────────────────────
CreateThread(function()
    exports.oxmysql:execute([[
        CREATE TABLE IF NOT EXISTS `fueltech_ecu` (
            `identifier`    VARCHAR(60)  NOT NULL,
            `vehicle_model` VARCHAR(60)  NOT NULL,
            `settings`      LONGTEXT     NOT NULL,
            `updated_at`    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (`identifier`, `vehicle_model`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ]], {})
end)

-- ── Carregar configurações ────────────────────────────────────────────────────
RegisterNetEvent('fueltech:loadECU', function(vehicleModel)
    local src = source
    local identifier = getIdentifier(src)

    exports.oxmysql:execute(
        'SELECT settings FROM fueltech_ecu WHERE identifier = ? AND vehicle_model = ?',
        { identifier, vehicleModel },
        function(result)
            if result and result[1] then
                TriggerClientEvent('fueltech:ecuLoaded', src, result[1].settings)
            else
                TriggerClientEvent('fueltech:ecuLoaded', src, nil)
            end
        end
    )
end)

-- ── Salvar configurações ──────────────────────────────────────────────────────
RegisterNetEvent('fueltech:saveECU', function(vehicleModel, settingsJson)
    local src = source
    local identifier = getIdentifier(src)

    exports.oxmysql:execute(
        'INSERT INTO fueltech_ecu (identifier, vehicle_model, settings) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE settings = ?, updated_at = NOW()',
        { identifier, vehicleModel, settingsJson, settingsJson }
    )
end)

