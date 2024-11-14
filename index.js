import { promises as fs } from 'fs';
import fetch from 'node-fetch';

const apiBaseUrl = "https://gateway-run.bls.dev/api/v1";
const ipServiceUrl = "https://tight-block-2413.txlabs.workers.dev";

async function readNodeAndHardwareId() {
    const data = await fs.readFile('id.txt', 'utf-8');
    const [nodeId, hardwareId] = data.trim().split(':');
    return { nodeId, hardwareId };
}

async function readAuthToken() {
    const data = await fs.readFile('user.txt', 'utf-8');
    return data.trim();
}

async function registerNode(nodeId, hardwareId) {
    const authToken = await readAuthToken();
    const registerUrl = `${apiBaseUrl}/nodes/${nodeId}`;
    const ipAddress = await fetchIpAddress();
    console.log(`[${new Date().toISOString()}] 正在注册节点，IP地址: ${ipAddress}, 硬件ID: ${hardwareId}`);
    const response = await fetch(registerUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({
            ipAddress,
            hardwareId
        })
    });
    const data = await response.json();
    console.log(`[${new Date().toISOString()}] 注册响应:`, data);
    return data;
}

async function startSession(nodeId) {
    const authToken = await readAuthToken();
    const startSessionUrl = `${apiBaseUrl}/nodes/${nodeId}/start-session`;
    console.log(`[${new Date().toISOString()}] 正在为节点 ${nodeId} 启动会话`);
    const response = await fetch(startSessionUrl, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${authToken}`
        }
    });
    const data = await response.json();
    console.log(`[${new Date().toISOString()}] 启动会话响应:`, data);
    return data;
}

async function stopSession(nodeId) {
    const authToken = await readAuthToken();
    const stopSessionUrl = `${apiBaseUrl}/nodes/${nodeId}/stop-session`;
    console.log(`[${new Date().toISOString()}] 正在停止节点 ${nodeId} 的会话`);
    const response = await fetch(stopSessionUrl, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${authToken}`
        }
    });
    const data = await response.json();
    console.log(`[${new Date().toISOString()}] 停止会话响应:`, data);
    return data;
}

async function pingNode(nodeId) {
    const authToken = await readAuthToken();
    const pingUrl = `${apiBaseUrl}/nodes/${nodeId}/ping`;
    console.log(`[${new Date().toISOString()}] 正在ping节点 ${nodeId}`);
    const response = await fetch(pingUrl, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${authToken}`
        }
    });
    const data = await response.json();
    console.log(`[${new Date().toISOString()}] Ping响应:`, data);
    return data;
}

async function fetchIpAddress() {
    const response = await fetch(ipServiceUrl);
    const data = await response.json();
    console.log(`[${new Date().toISOString()}] IP获取响应:`, data);
    return data.ip;
}

async function runAll() {
    try {
        const { nodeId, hardwareId } = await readNodeAndHardwareId();

        console.log(`[${new Date().toISOString()}] 读取到节点ID: ${nodeId}, 硬件ID: ${hardwareId}`);

        const registrationResponse = await registerNode(nodeId, hardwareId);
        console.log(`[${new Date().toISOString()}] 节点注册完成。响应:`, registrationResponse);

        const startSessionResponse = await startSession(nodeId);
        console.log(`[${new Date().toISOString()}] 会话已启动。响应:`, startSessionResponse);

        console.log(`[${new Date().toISOString()}] 发送初始ping...`);
        const initialPingResponse = await pingNode(nodeId);
        console.log(`[${new Date().toISOString()}] 初始ping响应:`, initialPingResponse);

        // 每60秒ping一次
        setInterval(async () => {
            console.log(`[${new Date().toISOString()}] 发送ping...`);
            const pingResponse = await pingNode(nodeId);
            console.log(`[${new Date().toISOString()}] Ping响应:`, pingResponse);
        }, 60000);
    } catch (error) {
        console.error(`[${new Date().toISOString()}] 发生错误:`, error);
    }
}

// 添加进程退出处理
process.on('SIGINT', async () => {
    try {
        const { nodeId } = await readNodeAndHardwareId();
        console.log(`[${new Date().toISOString()}] 正在优雅退出...`);
        await stopSession(nodeId);
        console.log(`[${new Date().toISOString()}] 会话已停止，正在退出程序`);
        process.exit(0);
    } catch (error) {
        console.error(`[${new Date().toISOString()}] 退出时发生错误:`, error);
        process.exit(1);
    }
});

// 启动程序
runAll();
