// Initial setup for the Zendesk app
const client = ZAFClient.init();
let conversationHistory = "";


client.on('app.registered', function appRegistered(e) {
    // do stuff
    console.log('app registered')
});


// Add event listener for the lightbox button
document.getElementById("openLightboxButton").addEventListener("click", openLightboxWithConversation);

async function openLightboxWithConversation() {
    try {
        // Open the modal and pass the conversation data
        const modalContext = await client.invoke('instances.create', {
            location: 'modal',
            url: 'assets/iframe.html',
            size: { width: '800px', height: '600px' }
        })

        // Get the modal client and send data to the modal
        const modalClient = client.instance(modalContext['instances.create'][0].instanceGuid);
    } catch (error) {
        console.error('Failed to retrieve conversation:', error);
    }
}


// Fetch OpenAI API token securely
client.metadata().then(metadata => {
    const apiToken = metadata.settings.openAIKey;

    // Standardize event listener assignments
    const buttonEvents = [
        { id: "summarizeButton", handler: () => summarizeConversation(apiToken) },
        { id: "handoffButton", handler: () => prepareHandoffNotes(apiToken) },
        { id: "sendAiInput", handler: () => chatWithAI(apiToken) },
        { id: "sentimentButton", handler: () => analyzeSentiment(apiToken) },
        { id: "reviewDocsButton", handler: () => generateReview(apiToken) },
        { id: 'suggestNextReplyButton', handler: () => suggestNextReply(apiToken) }
    ];

    buttonEvents.forEach(({ id, handler }) => {
        document.getElementById(id).addEventListener("click", handler);
    });

    ticket_conversation = ''
});

// Add new reusable function for OpenAI API calls
async function callOpenAI(apiToken, endpoint, payload) {

    document.getElementById("chat_error").innerText = "";

    const response = await fetch(`https://api.openai.com/v1/${endpoint}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiToken}`
        },
        body: JSON.stringify(payload)
    });
    return response.json();
}

// Add this function near the top with other utility functions
function toggleLoading(elementId, show) {
    const loadingElements = document.getElementsByClassName('ai-loading');
    for (let element of loadingElements) {
        element.style.display = show ? 'block' : 'none';
    }
}

// Add near the top with other utility functions
async function getConversation() {
    console.log(ticket_conversation)
    /*if (ticket_conversation && 
        'ticket.conversation' in ticket_conversation && 
        Array.isArray(ticket_conversation['ticket.conversation']) && 
        ticket_conversation['ticket.conversation'].length > 0) {
        return JSON.stringify(ticket_conversation);
    }*/
    const ticket = await client.get("ticket.conversation");
    //return ticket["ticket.conversation"].map(entry => entry.message.content).join("\n");
    return JSON.stringify(ticket["ticket.conversation"])
}
async function summarizeConversation(apiToken) {
    toggleLoading('summary', true);
    try {
        const conversation = await getConversation();
        appendChatMessage('user', "Summarise Conversation");


        const payload = {
            model: "gpt-4o-mini",
            messages: [
                {
                    "role": "system",
                    "content": "You are a helpful assistant that summarizes concisely Zendesk ticket conversations."
                },
                {
                    "role": "user",
                    "content": `Summarize the following conversation and highlight whats needed to solve this, what has been done and whats pending:\n\n${conversation}`
                }
            ],
            max_tokens: 1500
        };

        const data = await callOpenAI(apiToken, "chat/completions", payload);
        const aiResponse = `${marked.parse(data.choices[0].message.content)}`;
        appendChatMessage('AI ', aiResponse);
    } catch (error) {
        document.getElementById("chat_error").innerText = "Error generating summary";
    } finally {
        toggleLoading('summary', false);
    }
}

async function prepareHandoffNotes(apiToken) {
    toggleLoading('handoff', true);
    try {
        const conversation = await getConversation();

        // Use new method to append user message
        appendChatMessage('user', "Prepare Handoff Notes");

        const payload = {
            model: "gpt-4o-mini",
            messages: [
                {
                    "role": "user",
                    "content": `Prepare concisely handoff notes for the following conversation:\n\n${conversation}`
                }
            ],
            max_tokens: 1200
        };

        const data = await callOpenAI(apiToken, "chat/completions", payload);
        const handoffElement = document.getElementById("handoff");
        const aiResponse = `<div class="ai-block handoff">${marked.parse(data.choices[0].message.content)}</div>${handoffElement.innerHTML}`;
        appendChatMessage('AI ', aiResponse);
    } catch (error) {
        document.getElementById("chat_error").innerText = "Error generating handoff notes";
    } finally {
        toggleLoading('handoff', false);
    }
}

// New function to copy text to clipboard
function copyToClipboard(elem, text) {
    const originalColor = elem.style.backgroundColor;

    navigator.clipboard.writeText(text).then(() => {
        console.log('Text copied to clipboard');

        // Add temporary fading color effect
        elem.style.transition = 'background-color 0.5s ease';
        elem.style.backgroundColor = 'white'; // Change to desired color
        setTimeout(() => {
            elem.style.backgroundColor = originalColor; // Restore original color
        }, 500);
    }).catch(err => {
        console.error('Failed to copy text: ', err);
    });
}
// Update the appendChatMessage function to add click event for ai-message
function appendChatMessage(type, message) {
    const chatElement = document.getElementById("chat");
    const cssClass = type === 'user' ? 'user-message' : 'ai-message';
    const prefix = type === 'user' ? 'User: ' : 'AI: ';
    const content = type === 'ai' ? marked.parse(message) : marked.parse(message);

    // Create a new message element
    const messageElement = document.createElement('div');
    messageElement.className = `ai-block ${cssClass}`;
    messageElement.innerHTML = content;

    // Add click event to copy text for ai-message
    messageElement.onclick = () => copyToClipboard(messageElement, message);

    chatElement.insertBefore(messageElement, chatElement.firstChild);
}

async function chatWithAI(apiToken) {
    toggleLoading('chat', true);

    let ticketComment = await client.get('ticket.comment');
    let ticketPendingComment;

    try {
        const userMessage = document.getElementById("aiInput").value;
        const conversation = await getConversation();

        // Use new method to append user message
        appendChatMessage('user', userMessage);

        if (!conversationHistory) {
            conversationHistory = `Initial ticket conversation is: ${conversation}`;
        }

        if (ticketComment['ticket.comment'].text) {
            ticketPendingComment = `Pending Comment is: [${ticketComment['ticket.comment'].text}]`;
        }

        conversationHistory += `User: ${userMessage}\n`;

        const payload = {
            model: "gpt-4o-mini",
            messages: [
                {
                    "role": "user",
                    "content": conversationHistory + ticketPendingComment
                }
            ],
            max_tokens: 1200
        };

        const data = await callOpenAI(apiToken, "chat/completions", payload);
        const aiResponse = data.choices[0].message.content.trim();
        conversationHistory += `<b>AI:</b> ${aiResponse}\n`;

        // Use new method to append AI response
        appendChatMessage('ai', aiResponse);
        document.getElementById("aiInput").value = "";
    } catch (error) {
        const chatElement = document.getElementById("chat_error");
        chatElement.innerHTML = `<div class="error-message">Error generating response</div>${chatElement.innerHTML}`;
    } finally {
        toggleLoading('chat', false);
    }
}
async function analyzeSentiment(apiToken) {
    toggleLoading('sentiment', true);
    try {
        const conversation = await getConversation();
        appendChatMessage('user', "Analyze Conversation Sentiment");

        const payload = {
            model: "gpt-4o-mini",
            messages: [
                {
                    "role": "system",
                    "content": "You are an expert at analyzing conversation sentiment and tone. Analyze both customer sentiment and support team tone using concise text and a maximum of 100 words."
                },
                {
                    "role": "user",
                    "content": `Analyze the following conversation and provide insights about:
                    1. Customer's emotional state and sentiment
                    2. Support team's tone and effectiveness
                    3. Recommendations for improvement if any
                    
                    Conversation:\n${conversation}`
                }
            ],
            max_tokens: 1500
        };

        const data = await callOpenAI(apiToken, "chat/completions", payload);
        const aiResponse = `${marked.parse(data.choices[0].message.content)}`;
        appendChatMessage('AI ', aiResponse);
    } catch (error) {
        document.getElementById("chat_error").innerText = "Error analyzing sentiment";
    } finally {
        toggleLoading('sentiment', false);
    }
}

async function generateReview(apiToken) {
    toggleLoading('review', true);
    try {
        const conversation = await getConversation();
        appendChatMessage('user', "Reviewing Ticket");

        const payload = {
            model: "gpt-4o-mini",
            messages: [
                {
                    "role": "system",
                    "content": "You are a skilled support lead."
                },
                {
                    "role": "user",
                    "content": `Please review this ticket and highlight important response times, any gaps on communication from support team as  well as what tone and anything that could have been improve.
                    
                    Conversation:\n${conversation}`
                }
            ],
            max_tokens: 1500
        };

        const data = await callOpenAI(apiToken, "chat/completions", payload);
        const aiResponse = `${marked.parse(data.choices[0].message.content)}`;
        appendChatMessage('AI ', aiResponse);
    } catch (error) {
        document.getElementById("chat_error").innerText = "Error generating ticket review";
    } finally {
        toggleLoading('review', false);
    }
}

async function suggestNextReply(apiToken) {
    toggleLoading('next_reply', true);
    try {
        const conversation = await getConversation();
        appendChatMessage('user', "Suggesting Next Reply");

        const payload = {
            model: "gpt-4o-mini",
            messages: [
                {
                    "role": "system",
                    "content": "You are a skilled support engineer."
                },
                {
                    "role": "user",
                    "content": `Please suggest a next ticket reply based on latest notes.
                    
                    Conversation:\n${conversation}`
                }
            ],
            max_tokens: 1500
        };

        const data = await callOpenAI(apiToken, "chat/completions", payload);
        const aiResponse = `${marked.parse(data.choices[0].message.content)}`;
        appendChatMessage('AI ', aiResponse);
    } catch (error) {
        console.log(error)
        document.getElementById("chat_error").innerText = "Error generating next reply";
    } finally {
        toggleLoading('next_reply', false);
    }
}
