const fs = require('fs').promises;
const { HttpsProxyAgent } = require('https-proxy-agent');
const readline = require('readline');
const config = require('./config');

const apiBaseUrl = "https://gateway-run.bls.dev/api/v1";
const ipServiceUrl = "https://tight-block-2413.txlabs.workers.dev";
let useProxy;

async function loadFetch() {
    const fetch = await import('node-fetch').then(module => module.default);
    return fetch;
}

async function promptUseProxy() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise(resolve => {
        rl.question('是否使用代理? (y/n): ', answer => {
            rl.close();
            resolve(answer.toLowerCase() === 'y');
        });
    });
}

async function fetchIpAddress(fetch, agent) {
    const response = await fetch(ipServiceUrl, { agent });
    const data = await response.json();
    console.log(`[${new Date().toISOString()}] IP 获取响应:`, data);
    return data.ip;
}

async function registerNode(nodeId, hardwareId, ipAddress, proxy, authToken) {
    const fetch = await loadFetch();
    let agent;

    if (proxy) {
        agent = new HttpsProxyAgent(proxy);
    }

    const registerUrl = `${apiBaseUrl}/nodes/${nodeId}`;
    console.log(`[${new Date().toISOString()}] 正在注册节点，IP: ${ipAddress}, 硬件ID: ${hardwareId}`);
    const response = await fetch(registerUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({
            ipAddress,
            hardwareId
        }),
        agent
    });

    let data;
    try {
        data = await response.json();
    } catch (error) {
        const text = await response.text();
        console.error(`[${new Date().toISOString()}] JSON解析失败。响应文本:`, text);
        throw error;
    }

    console.log(`[${new Date().toISOString()}] 注册响应:`, data);
    return data;
}

async function startSession(nodeId, proxy, authToken) {
    const fetch = await loadFetch();
    let agent;

    if (proxy) {
        agent = new HttpsProxyAgent(proxy);
    }

    const startSessionUrl = `${apiBaseUrl}/nodes/${nodeId}/start-session`;
    console.log(`[${new Date().toISOString()}] 正在启动节点 ${nodeId} 的会话，这可能需要一些时间...`);
    const response = await fetch(startSessionUrl, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${authToken}`
        },
        agent
    });
    const data = await response.json();
    console.log(`[${new Date().toISOString()}] 会话启动响应:`, data);
    return data;
}

async function pingNode(nodeId, proxy, ipAddress, authToken) {
    const fetch = await loadFetch();
    const chalk = await import('chalk');
    let agent;

    if (proxy) {
        agent = new HttpsProxyAgent(proxy);
    }

    const pingUrl = `${apiBaseUrl}/nodes/${nodeId}/ping`;
    console.log(`[${new Date().toISOString()}] 正在 ping 节点 ${nodeId}，使用代理 ${proxy}`);
    const response = await fetch(pingUrl, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${authToken}`
        },
        agent
    });
    const data = await response.json();

    let statusColor = data.status.toLowerCase() === 'ok' ? chalk.default.green : chalk.default.red;
    const logMessage = `[${new Date().toISOString()}] Ping 响应状态: ${statusColor(data.status.toUpperCase())}, 节点ID: ${chalk.default.cyan(nodeId)}, 代理: ${chalk.default.yellow(proxy)}, IP: ${chalk.default.yellow(ipAddress)}`;
    console.log(logMessage);
    
    return data;
}

async function processNode(node, proxy, ipAddress, authToken) {
    while (true) {
        try {
            console.log(`[${new Date().toISOString()}] 正在处理节点ID: ${node.nodeId}, 硬件ID: ${node.hardwareId}, IP: ${ipAddress}`);
            
            const registrationResponse = await registerNode(node.nodeId, node.hardwareId, ipAddress, proxy, authToken);
            console.log(`[${new Date().toISOString()}] 节点注册完成，节点ID: ${node.nodeId}. 响应:`, registrationResponse);
            
            const startSessionResponse = await startSession(node.nodeId, proxy, authToken);
            console.log(`[${new Date().toISOString()}] 会话已启动，节点ID: ${node.nodeId}. 响应:`, startSessionResponse);
            
            console.log(`[${new Date().toISOString()}] 正在发送初始 ping，节点ID: ${node.nodeId}`);
            await pingNode(node.nodeId, proxy, ipAddress, authToken);

            setInterval(async () => {
                try {
                    console.log(`[${new Date().toISOString()}] 正在发送 ping，节点ID: ${node.nodeId}`);
                    await pingNode(node.nodeId, proxy, ipAddress, authToken);
                } catch (error) {
                    console.error(`[${new Date().toISOString()}] Ping 过程中出错: ${error.message}`);
                    throw error;
                }
            }, 60000);

            break;

        } catch (error) {
            console.error(`[${new Date().toISOString()}] 节点ID: ${node.nodeId} 出现错误，50秒后重启进程: ${error.message}`);
            await new Promise(resolve => setTimeout(resolve, 50000));
        }
    }
}

async function runAll(initialRun = true) {
    try {
        if (initialRun) {
            useProxy = await promptUseProxy();
        }

        for (const user of config) {
            for (const node of user.nodes) {
                const proxy = useProxy ? node.proxy : null;
                const ipAddress = useProxy ? await fetchIpAddress(await loadFetch(), proxy ? new HttpsProxyAgent(proxy) : null) : null;

                processNode(node, proxy, ipAddress, user.usertoken);
            }
        }
    } catch (error) {
        const chalk = await import('chalk');
        console.error(chalk.default.yellow(`[${new Date().toISOString()}] 发生错误: ${error.message}`));
    }
}

process.on('uncaughtException', (error) => {
    console.error(`[${new Date().toISOString()}] 未捕获的异常: ${error.message}`);
    runAll(false);
});

runAll();
