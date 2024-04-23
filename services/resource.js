require('dotenv').config();

// Import OpenAI API and File System
const { Configuration, OpenAIApi } = require('openai');
const detectLanguage = require('lang-detector');
const chalk = require('chalk');
const axios = require('axios');
const config = require("config");
const AWS = require('aws-sdk');

AWS.config.update({
    region: process.env.REGION, // replace with your region
});


const docClient = new AWS.DynamoDB.DocumentClient();

const postCommentToGitHub = async (repoName, commitId, comment) => {
    const [owner, repo] = repoName.split('/');
    const url = `https://api.github.com/repos/${owner}/${repo}/commits/${commitId}/comments`;
    const response = await axios.post(url, { body: comment }, {
        headers: { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}` }
    });
    return response.data;
};


// Function to create a pull request
const createPullRequest = async (repoName, base, head, title, body) => {
    const [owner, repo] = repoName.split('/');
    const createPRUrl = `https://api.github.com/repos/${owner}/${repo}/pulls`;
    console.log("Create PR URL:", createPRUrl)
    try {
        // Create a pull request from `head` to `base`
        const prResponse = await axios.post(createPRUrl, {
            title: title,
            body: body,
            head: head,
            base: base
        }, {
            headers: { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}` }
        });

        return prResponse.data; // Return the response which includes PR details
    } catch (err) {
        if (err.response) {
            console.error('GitHub API responded with:', err.response.data);
        }
        throw new Error(`Failed to create pull request: ${err.message}`);
    }
};


// Function to create and merge a pull request
// const mergeBranches = async (repoName, base, head, title, body) => {
//     const [owner, repo] = repoName.split('/');
//     const createPRUrl = `https://api.github.com/repos/${owner}/${repo}/pulls`;
    
//     try {
//         // Create a pull request from `head` to `base`
//         const prResponse = await axios.post(createPRUrl, {
//             title: title,
//             body: body,
//             head: head,
//             base: base
//         }, {
//             headers: { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}` }
//         });

//         // If the PR is created successfully, merge it
//         const mergeUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${prResponse.data.number}/merge`;
//         const mergeResponse = await axios.put(mergeUrl, {
//             commit_title: `Merging ${head} into ${base}`,
//             commit_message: body,
//             merge_method: 'merge' // You can also use 'squash' or 'rebase'
//         }, {
//             headers: { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}` }
//         });

//         return mergeResponse.data;
//     } catch (err) {
//         throw new Error(`Failed to create or merge pull request: ${err.message}`);
//     }
// };

const storeDataInDynamoDB = async (data) => {
    const params = {
        TableName: 'prod-commit-reviews',
        Item: data
    };
    return docClient.put(params).promise();
};

const callOpenAPI = async (userRequest) => {
    try {
        const configuration = new Configuration({ apiKey: process.env.GPT_TOKEN });
        const openai = new OpenAIApi(configuration);

        let detailedPrompt = `Add proper styling like readme.md but don't add text readme.md & provide a detailed code review from the commit, The review should include:
        1. Summary by Zoom CodeGuard
        2. List of New Features, Enhancements, Bug Fixes, and Documentation changes
        3. A walkthrough explaining the integration and functionality enhancements
        4. Detailed changes per file
        5. Identify all the hardcoded value
        6. Highlight any hardcoded or potentially sensitive values`;

        // Adding the system-generated prompt to userRequest messages
        userRequest.messages.unshift({
            role: "system",
            content: detailedPrompt
        });

        // console.log("------------------ User Request -------------------")
        // console.log(userRequest)

        const completion = await openai.createChatCompletion({
            model: process.env.GPT_MODEL,
            messages: userRequest.messages,
        });

        return completion.data.choices[0].message.content; // Assuming GPT-4 returns data in this structure
    } catch (err) {
        console.error("Error calling OpenAI:", err.message);
        throw new Error(`Failing Open AI due to: ${err.message}`);
    }
};

exports.handleGitHubCodeReview = async (body) => {
    try {
        const { filesChanged } = body;

        console.log("--------------------------------------------");
        console.log(body);
        console.log("--------------------------------------------");

        let filesData = [];

        for (const file of filesChanged) {
            const fileContent = await getFileContent(file.raw_url);
            // const directories = file.filename.split('/');
            filesData.push({
                // filename: directories[directories.length - 1],
                role: 'user',
                content: fileContent,
            });
        }

       

        let userRequest = {
            model: process.env.GPT_MODEL,
            messages: [...filesData]
        };

       
        let reviewData = await callOpenAPI(userRequest);

        reviewData = reviewData.trim();
        reviewData = reviewData.replace(/```\s*json\s*\n/, '');
        reviewData = reviewData.replace(/\n```$/, '');

        await storeDataInDynamoDB({
            commitId: body.commitId,
            userId: body.committerUserId,
            totalLinesAdded: body.totalLinesAdded,
            repoName: body.repoName,
            filesChanged: body.filesChanged,
            comments: reviewData,
            mergeToProduction: false
        });

        await postCommentToGitHub(body.repoName, body.commitId, reviewData);
        await createPullRequest(body.repoName, 'master', 'develop', 'AI Code Review Enhancements and Fixes', reviewData);

        return { message: 'Comments were successfully posted to GitHub. A pull request (PR) was also created.' };

    } catch (err) {
        console.error("Error in handleGitHubCodeReview:", err);
        throw err; // Rethrow the error for upstream handling
    }
};

const getFileContent = async (url) => {
    try {
        console.log("Url are:", url)
        const response = await axios.get(url, {
            headers: { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}` }
        });
        return JSON.stringify(response.data);
    } catch (error) {
        throw new Error(`Failed to fetch file content: ${error.message}`);
    }
};