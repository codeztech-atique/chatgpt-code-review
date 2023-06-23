require('dotenv').config()
const server = require('./index');
const port = process.env.PORT || 8081;
const chalk = require('chalk');

// Server
server.listen(port, () => {
    console.log(chalk.green('╔═══════════════════════════════════════════════════════════'));
    console.log(chalk.green('║ Background Server Listening at | port: %s', port));
    console.log(chalk.green('╚═══════════════════════════════════════════════════════════'));
});