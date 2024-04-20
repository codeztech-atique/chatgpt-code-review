require('dotenv').config();

// Import OpenAI API and File System
const { Configuration, OpenAIApi } = require('openai');
const detectLanguage = require('lang-detector');
const chalk = require('chalk');
const axios = require('axios');
const config = require("config");


// Build the prompt for OpenAI API.
var prompt = config.get("promptMessage");


const getCommittedFileDetails = (committedFileUrl) => {
    return new Promise((resolve, reject) => {
        axios.get(committedFileUrl).then((res) => {
            // prompt = prompt + `${res.data}`;
            resolve(res.data);
        }).catch((err) => {
            reject(err);
        })
    })
}


const delectProgrammingLanguage = (data) => {
    return new Promise((resolve, reject) => {
        try {
            resolve({
                language: detectLanguage(data),
                data: data
            });
        } catch(err) {
            reject(err);
        }
    })
}

const callOpenAPI = async (body, request) => {
    try {
        // Config OpenAI API.
        const configuration = new Configuration({
            apiKey: process.env.GPT_TOKEN,
        });

        // Create an OpenAI API client
        const openai = new OpenAIApi(configuration);

        // Make the API call to get the completion
        const completion = await openai.createChatCompletion(request);

        // Extract the content from the response
        const review = completion.data?.choices[0]?.message?.content;
        
        return review;
    } catch(err) {
        // Throw an error with a more descriptive message
        throw new Error(`Failing Open AI due to: ${err.message}`);
    }
}


exports.callOpenAIAPI = (body) => {
    // Read the file
    const committedFileUrl = body.url;
    return new Promise((resolve, reject) => {
        const userRequest = {
            model: process.env.GPT_MODEL,
            messages: []
        }

        getCommittedFileDetails(committedFileUrl).then(async(res) => {
           return delectProgrammingLanguage(res);
        }).then((response) => {
            userRequest.messages.push(
                {
                    role: "system",
                    content: response.language
                },
                {
                    role: "user",
                    content: "Please review the code and add comments. Could you also provide a rating out of 10 based on the code review? Return the response in JSON format. Make sure you will have 3 json field name - comments, rating & ratingJustification."
                },
                {
                    role: "user",
                    content: response.data
                }
            );
            return callOpenAPI(body, userRequest);
        }).then((finalResponse) => {
            console.log(chalk.green(prompt), finalResponse);
            resolve(finalResponse);
        }).catch((err) => {
            console.log("Error here:", err);
            reject(err);
        });
    })
}