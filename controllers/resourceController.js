const config = require('config');
const service = require('../services/resource');

exports.codeReviewed = async(req, res) => {
    try {
        res.status(config.get('success').statusCode).send({ message: "Request received and is being processed." });
        
        await service.handleGitHubCodeReview(req.body);
    } catch(err) {
        console.error("Error processing request:", err);
        res.status(config.get('error').statusCode).send({
            error: err
        })
    }
}

