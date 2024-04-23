const config = require('config');
const service = require('../services/resource');

exports.codeReviewed = async(req, res) => {
    try {
        const getGPTResponse = await service.handleGitHubCodeReview(req.body);
        res.status(config.get('success').statusCode).send(getGPTResponse);
    } catch(err) {
        console.error("Error processing request:", err);
        res.status(config.get('error').statusCode).send({
            error: err
        })
    }
}

