const config = require('config');
const service = require('../services/resource');

exports.codeReviewed = async(req, res) => {
    try {
        console.log("=========================")
        console.log(req.body);
        console.log("=========================")
        // const getGPTResponse = await service.callOpenAIAPI(req.body);
        res.status(config.get('success').statusCode).send(req.body);
    } catch(err) {
        res.send(config.get('error').statusCode).send({
            error: err
        })
    }
}

