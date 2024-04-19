const chalk = require("chalk");

exports.validate = (req, res, next) => {
    var error = '';
    if (req.body.url === undefined || req.body.url === '') {
      console.log(chalk.red('url is missing'));
      error += "url, "
    } if (error !== '') {
        res.status(400).send({
          status: 400,
          message: error + ' is required !!!'
        });
    } else {
        next();
    }
}