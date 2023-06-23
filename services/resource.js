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

const callOpenAPI = (body, request) => {
    return new Promise(async(resolve, reject) => {
        try {
            // Config OpenAI API.
            const configuration = new Configuration({
                apiKey: body.token,
            });

            // Config Language Detect API
            const openai = new OpenAIApi(configuration);

            const completion = await openai.createChatCompletion(request);
            const review = completion.data?.choices[0]?.message?.content;
            resolve(review);
        } catch(err) {
            reject("Failing Open AI:", err);
        }
    })
}

exports.callOpenAIAPI = (body) => {
    // Read the file
    const committedFileUrl = body.url;
    return new Promise((resolve, reject) => {
        const userRequest = {
            model: "gpt-3.5-turbo",
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
                    content: response.data
                }
            );
            return callOpenAPI(body, userRequest);
        }). 
        then((finalResponse) => {
            console.log(chalk.green(prompt), finalResponse);
            resolve(finalResponse);
        }).catch((err) => {
            console.log("Error:", err);
            reject(err);
        });
    })
}