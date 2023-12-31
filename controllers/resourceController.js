const config = require('config');
const service = require('../services/resource');

exports.codeReviewed = async(req, res) => {
    try {
        const getGPTResponse = await service.callOpenAIAPI(req.body);
        res.status(config.get('success').statusCode).send(getGPTResponse);
    } catch(err) {
        res.send(config.get('error').statusCode).send({
            error: err
        })
    }
}

