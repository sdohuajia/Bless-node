import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import readline from 'readline';
import chalk from 'chalk';
import fetch from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';

const require = createRequire(import.meta.url);
const config = require('./config');

const apiBaseUrl = "https://gateway-run.bls.dev/api/v1";
const ipServiceUrl = "https://tight-block-2413.txlabs.workers.dev";
let useProxy;

async function promptUseProxy() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise(resolve => {
        rl.question('是否使用代理？(y/n): ', answer => {
            rl.close();
            resolve(answer.toLowerCase() === 'y');
        });
    });
}

async function fetchIpAddress(agent) {
    const response = await fetch(ipServiceUrl, { agent });
    const data = await response.json();
    console.log(`[${new Date().toISOString()}] IP 获取响应:`, data);
    return data.ip;
}

async function registerNode(nodeId, hardwareId, ipAddress, proxy, authToken) {
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
    let agent;
    if (proxy) {
        agent = new HttpsProxyAgent(proxy);
    }

    const startSessionUrl = `${apiBaseUrl}/nodes/${nodeId}/start-session`;
    console.log(`[${new Date().toISOString()}] 正在启动节点 ${nodeId} 的会话，可能需要一段时间...`);
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
    let agent;
    if (proxy) {
        agent = new HttpsProxyAgent(proxy);
    }

    const pingUrl = `${apiBaseUrl}/nodes/${nodeId}/ping`;
    console.log(`[${new Date().toISOString()}] 正在ping节点 ${nodeId}，使用代理 ${proxy}`);
    const response = await fetch(pingUrl, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${authToken}`
        },
        agent
    });
    const data = await response.json();

    let statusColor = data.status.toLowerCase() === 'ok' ? chalk.green : chalk.red;
    const logMessage = `[${new Date().toISOString()}] Ping响应状态: ${statusColor(data.status.toUpperCase())}, 节点ID: ${chalk.cyan(nodeId)}, 代理: ${chalk.yellow(proxy)}, IP: ${chalk.yellow(ipAddress)}`;
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
            
            console.log(`[${new Date().toISOString()}] 发送初始ping，节点ID: ${node.nodeId}`);
            await pingNode(node.nodeId, proxy, ipAddress, authToken);

            setInterval(async () => {
                try {
                    console.log(`[${new Date().toISOString()}] 发送ping，节点ID: ${node.nodeId}`);
                    await pingNode(node.nodeId, proxy, ipAddress, authToken);
                } catch (error) {
                    console.error(`[${new Date().toISOString()}] Ping过程中出错: ${error.message}`);
                    throw error;
                }
            }, 60000);

            break;

        } catch (error) {
            console.error(`[${new Date().toISOString()}] 节点ID: ${node.nodeId} 出错，50秒后重启进程: ${error.message}`);
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
                const ipAddress = useProxy ? await fetchIpAddress(proxy ? new HttpsProxyAgent(proxy) : null) : null;

                processNode(node, proxy, ipAddress, user.usertoken);
            }
        }
    } catch (error) {
        console.error(chalk.yellow(`[${new Date().toISOString()}] 发生错误: ${error.message}`));
    }
}

process.on('uncaughtException', (error) => {
    console.error(`[${new Date().toISOString()}] 未捕获的异常: ${error.message}`);
    runAll(false);
});

runAll();
