require('dotenv').config();

// Import OpenAI API and File System
const { Configuration, OpenAIApi } = require('openai');
const detectLanguage = require('lang-detector');
const chalk = require('chalk');
const axios = require('axios');
const config = require("config");


// Build the prompt for OpenAI API.
var prompt = config.get("promptMessage");


// const getCommittedFileDetails = (committedFileUrl) => {
//     return new Promise((resolve, reject) => {
//         axios.get(committedFileUrl).then((res) => {
//             // prompt = prompt + `${res.data}`;
//             resolve(res.data);
//         }).catch((err) => {
//             reject(err);
//         })
//     })
// }


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


const getFileContent = async (file) => {
    try {
        const response = await axios.get(file.raw_url, {
            headers: { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}` }
        });
        return response.data;
    } catch (error) {
        throw new Error(`Failed to fetch file content: ${error.message}`);
    }
};

exports.callOpenAIAPI = (body) => {
    return new Promise(async (resolve, reject) => {
        try {
            const { filesChanged } = body;
            const userRequest = {
                model: process.env.GPT_MODEL,
                messages: []
            };

            // Get file content for each file changed
            for (const file of filesChanged) {
                const fileContent = await getFileContent(file);
                const language = detectLanguage(fileContent);

                // Here, I am assuming you would like to add each file content to the OpenAI request
                userRequest.messages.push({
                    role: "system",
                    content: `The file ${file.filename} is written in ${language}.`
                }, {
                    role: "user",
                    content: "Please review the code and add comments. Could you also provide a rating out of 10 based on the code review? Return the response in JSON format. Make sure you will have 3 json fields named - comments, rating & ratingJustification."
                }, {
                    role: "user",
                    content: fileContent
                });
            }

            // Now call OpenAI API with the request
            const finalResponse = await callOpenAPI(body, userRequest);
            console.log(chalk.green(prompt), finalResponse);
            resolve(finalResponse);
        } catch (err) {
            console.error(chalk.red("Error here:", err));
            reject(err);
        }
    });
};