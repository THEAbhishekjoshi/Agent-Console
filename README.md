# README.md

## Architecture Summary
This frontend connects to a WebSocket server and processes messages as a continuous stream of events. To handle the unstable network (Chaos Mode), we implemented a buffer using a Map to catch out-of-order packets and a sequence tracker (`highestSeq`) to ensure UI updates happen in exact order. We also built an auto-recovery mechanism (NACK timeout) that automatically requests missing packets from the server if they get dropped, ensuring the chat never gets permanently stuck.

## WebSocket State Machine

Below is the state transition diagram of our client-side WebSocket lifecycle and stream states. It illustrates how the client manages handshakes, streams, tool block suspensions, and exponential backoff retry cycles:

```mermaid
stateDiagram-v2
    [*] --> disconnected
    disconnected --> connecting : connectWebSocket()
    connecting --> connected : onopen (reconnectAttempts = 0)
    connecting --> resuming : onopen (reconnectAttempts > 0)
    resuming --> connected : Send RESUME(last_seq)
    
    connected --> streaming : onmessage (TOKEN)
    streaming --> tool_call_pending : onmessage (TOOL_CALL)
    tool_call_pending --> streaming : onmessage (TOOL_RESULT)
    
    connected --> connected : onmessage (PING) -> Send PONG
    streaming --> connected : onmessage (STREAM_END)
    
    connected --> reconnecting : onclose / onerror (abnormal)
    streaming --> reconnecting : onclose / onerror (abnormal)
    tool_call_pending --> reconnecting : onclose / onerror (abnormal)
    
    reconnecting --> connecting : Timeout (Exponential Backoff Delay)
    reconnecting --> disconnected : component unmounts (isUnmounted = true)
```

## How to Run
1. Start the backend agent server:
   Navigate to agent-server directory and build/run the backend Docker container (https://github.com/Alchemyst-ai/hiring/tree/main/June-2026_FullStackAI/agent-server)
   ```bash
   cd agent-server
   docker run -p 4747:4747 agent-server --mode chaos
   ```
2. Start the frontend:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
3. Open `http://localhost:3000` in your browser.

## Screenshots and Media
*Please add your media files here:*
- **(a) Streamed response with a tool call**: ![alt text](public/image-3.png)
- **(b) Trace timeline**: ![alt text](public/image-1.png)
- **(c) Context inspector showing a diff**: ![alt text](public/image-2.png)
- **(d) ChatInterface with Tabs**: ![alt text](public/image.png)
- **Chaos Mode Screen Recording**: https://www.loom.com/share/11d22bfc16354bb9a81125fa06ad540e
