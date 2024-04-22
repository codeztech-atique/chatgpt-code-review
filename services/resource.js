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

// Function to create and merge a pull request
const mergeBranches = async (repoName, base, head, title, body) => {
    const [owner, repo] = repoName.split('/');
    const createPRUrl = `https://api.github.com/repos/${owner}/${repo}/pulls`;
    
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

        // If the PR is created successfully, merge it
        const mergeUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${prResponse.data.number}/merge`;
        const mergeResponse = await axios.put(mergeUrl, {
            commit_title: `Merging ${head} into ${base}`,
            commit_message: body,
            merge_method: 'merge' // You can also use 'squash' or 'rebase'
        }, {
            headers: { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}` }
        });

        return mergeResponse.data;
    } catch (err) {
        throw new Error(`Failed to create or merge pull request: ${err.message}`);
    }
};

const storeDataInDynamoDB = async (data) => {
    const params = {
        TableName: 'prod-commit-reviews',
        Item: data
    };
    return docClient.put(params).promise();
};

const callOpenAPI = async (body, request) => {
    try {
        const configuration = new Configuration({ apiKey: process.env.GPT_TOKEN });
        const openai = new OpenAIApi(configuration);

        // Adjust the prompt format here
        let detailedPrompt = `Given the code changes in JSON format: ${JSON.stringify(request, null, 2)}, 
        provide a detailed code review. The review should include:
        1. Summary by CodeRabbit
        2. List of New Features, Enhancements, Bug Fixes, and Documentation changes
        3. A walkthrough explaining the integration and functionality enhancements
        4. Detailed changes per file
        5. Highlight any hardcoded or potentially sensitive values`;

        const completion = await openai.createChatCompletion({
            model: process.env.GPT_MODEL,
            messages: [{ role: "system", content: detailedPrompt }],
        });

        return completion.data.choices[0].message.content; // Assuming GPT-4 returns data in this structure
    } catch (err) {
        throw new Error(`Failing Open AI due to: ${err.message}`);
    }
};

const detectHardcodedValues = (code) => {
    const patterns = [
        /\w+Key\s*=\s*['"][^'"]+['"]/g, // Matches something like apiKey = "abc123"
        /\w+Token\s*=\s*['"][^'"]+['"]/g, // Matches something like apiToken = "secret"
        /\w+Secret\s*=\s*['"][^'"]+['"]/g, // Matches something like secretKey = "verySecret"
    ];
    return patterns.flatMap(pattern => code.match(pattern) || []);
};

exports.callOpenAIAPI = async (body) => {
    try {
        const { filesChanged } = body;

        console.log("--------------------------------------------")
        console.log(body);
        console.log("--------------------------------------------")

        let filesData = [];

        // Fetch and prepare file data with hardcoded value detection
        for (const file of filesChanged) {
            const fileContent = await getFileContent(file.raw_url);
            filesData.push({
                filename: file.filename,
                content: fileContent
            });
        }

        // Prepare review request data including detection of hardcoded values
        const preparedReview = prepareReviewRequest(filesData);

        let userRequest = {
            model: process.env.GPT_MODEL,
            messages: [{
                role: "system",
                content: `Analyze the following code changes and provide a detailed code review:`
            }, {
                role: "user",
                content: JSON.stringify(preparedReview)
            }]
        };

        let reviewData = await callOpenAPI(body, userRequest);
        reviewData = reviewData.trim();  // Remove leading/trailing whitespace
        reviewData = reviewData.replace(/```\s*json\s*\n/, '');  // Remove the starting delimiter
        reviewData = reviewData.replace(/\n```$/, '');  // Remove the ending delimiter

        const jsonObject = JSON.parse(reviewData);

        const isGoodRating = jsonObject.rating > 5;
        await storeDataInDynamoDB({
            commitId: body.commitId,
            userId: body.committerUserId,
            totalLinesAdded: body.totalLinesAdded,
            repoName: body.repoName,
            filesChanged: body.filesChanged,
            comments: jsonObject.comments,
            rating: jsonObject.rating,
            ratingJustification: jsonObject.ratingJustification,
            mergeToProduction: isGoodRating // Store the flag based on rating
        });

        for (const comment of jsonObject.comments) {
            await postCommentToGitHub(body.repoName, body.commitId, comment);
        }

        if (isGoodRating) {
            // Create and merge a pull request from 'develop' to 'master'
            await mergeBranches(body.repoName, 'master', 'develop', 'Automated PR by Bot', 'Automatically merging due to good review ratings.');
            console.log('Successfully merged develop into master');
            return { message: 'Comments posted to GitHub successfully. Successfully merged develop into master.' };
        } else {
            console.log('Your code has less than 5 rating. Code does not merge with master branch, please check your commit comments.');
            return { message: 'Your code has less than 5 rating. Code does not merge with master branch, please check your commit comments.' };
        }

    } catch (err) {
        console.error(chalk.red("Error:", err));
        throw err; // Rethrow the error for upstream handling
    }
};


const getFileContent = async (url) => {
    try {
        const response = await axios.get(url, {
            headers: { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}` }
        });
        return response.data;
    } catch (error) {
        throw new Error(`Failed to fetch file content: ${error.message}`);
    }
};