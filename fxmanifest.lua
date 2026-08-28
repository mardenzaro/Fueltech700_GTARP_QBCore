fx_version 'cerulean'
game 'gta5'
lua54 'on'
ui_page 'html/index.html'

client_scripts {
    'client.lua'
}

server_scripts {
    '@oxmysql/lib/MySQL.lua',
    'server.lua'
}

files {
    'html/index.html',
    'html/style.css',
    'html/script.js',
    'html/turbo_spool.ogg',
    'html/turbo_bov.ogg',
}
