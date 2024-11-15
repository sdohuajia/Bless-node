import { promises as fs } from 'fs';
import pkg from 'https-proxy-agent';
const { HttpsProxyAgent } = pkg;
import readline from 'readline';
import fetch from 'node-fetch';
import chalk from 'chalk';

const apiBaseUrl = "https://gateway-run.bls.dev/api/v1";
const ipServiceUrl = "https://tight-block-2413.txlabs.workers.dev";

async function readProxies() {
    const data = await fs.readFile('proxy.txt', 'utf-8');
    const proxies = data.trim().split('\n').filter(proxy => proxy);
    return proxies;
}

async function readNodeAndHardwareIds() {
    const data = await fs.readFile('id.txt', 'utf-8');
    const ids = data.trim().split('\n').filter(id => id).map(id => {
        const [nodeId, hardwareId] = id.split(':');
        return { nodeId, hardwareId };
    });
    return ids;
}

async function readAuthToken() {
    const data = await fs.readFile('user.txt', 'utf-8');
    return data.trim();
}

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

async function registerNode(nodeId, hardwareId, ipAddress, proxy) {
    const authToken = await readAuthToken();
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
        console.error(`[${new Date().toISOString()}] JSON解析失败。响应内容:`, text);
        throw error;
    }

    console.log(`[${new Date().toISOString()}] 注册响应:`, data);
    return data;
}

async function startSession(nodeId, proxy) {
    const authToken = await readAuthToken();
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

async function pingNode(nodeId, proxy, ipAddress) {
    const authToken = await readAuthToken();
    let agent;

    if (proxy) {
        agent = new HttpsProxyAgent(proxy);
    }

    const pingUrl = `${apiBaseUrl}/nodes/${nodeId}/ping`;
    console.log(`[${new Date().toISOString()}] 正在对节点 ${nodeId} 进行ping操作，使用代理 ${proxy}`);
    const response = await fetch(pingUrl, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${authToken}`
        },
        agent
    });
    const data = await response.json();
    
    const lastPing = data.pings[data.pings.length - 1].timestamp;
    const logMessage = `[${new Date().toISOString()}] Ping响应, ID: ${chalk.green(data._id)}, 节点ID: ${chalk.green(data.nodeId)}, 最后Ping时间: ${chalk.yellow(lastPing)}, 代理: ${proxy}, IP: ${ipAddress}`;
    console.log(logMessage);
    
    return data;
}

async function runAll() {
    try {
        const useProxy = await promptUseProxy();

        const ids = await readNodeAndHardwareIds();
        const proxies = await readProxies();

        if (useProxy && proxies.length !== ids.length) {
            throw new Error(chalk.yellow(`代理数量 (${proxies.length}) 与节点ID:硬件ID对数量不匹配 (${ids.length})`));
        }

        for (let i = 0; i < ids.length; i++) {
            const { nodeId, hardwareId } = ids[i];
            const proxy = useProxy ? proxies[i] : null;
            const ipAddress = useProxy ? await fetchIpAddress(proxy ? new HttpsProxyAgent(proxy) : null) : null;

            console.log(`[${new Date().toISOString()}] 正在处理节点ID: ${nodeId}, 硬件ID: ${hardwareId}, IP: ${ipAddress}`);

            const registrationResponse = await registerNode(nodeId, hardwareId, ipAddress, proxy);
            console.log(`[${new Date().toISOString()}] 节点注册完成，节点ID: ${nodeId}. 响应:`, registrationResponse);

            const startSessionResponse = await startSession(nodeId, proxy);
            console.log(`[${new Date().toISOString()}] 会话已启动，节点ID: ${nodeId}. 响应:`, startSessionResponse);

            console.log(`[${new Date().toISOString()}] 正在发送初始ping，节点ID: ${nodeId}`);
            const initialPingResponse = await pingNode(nodeId, proxy, ipAddress);

            setInterval(async () => {
                console.log(`[${new Date().toISOString()}] 正在发送ping，节点ID: ${nodeId}`);
                const pingResponse = await pingNode(nodeId, proxy, ipAddress);
            }, 10000);
        }

    } catch (error) {
        console.error(chalk.yellow(`[${new Date().toISOString()}] 发生错误: ${error.message}`));
    }
}

runAll();
