const express = require('express');
const bodyParser = require('body-parser');
const app = express();

app.use(bodyParser.json());


// Controller
const resourceController = require('../controllers/resourceController');
const headerValidation = require('../middleware/headerValidation')
const validateRequest = require('../middleware/validateRequest')

// Sample API testing without bearerTokenPresent
app.get('/', (req, res) => {
   res.status(200).send({
      message:'App is working fine!'
   });
});


// Get GPT Response
app.post('/code-review', [headerValidation.bearerTokenPresent, validateRequest.validateRequest], (req, res) => { 
    resourceController.codeReviewed(req, res);
});


module.exports = app;