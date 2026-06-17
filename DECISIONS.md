# DECISIONS.md

## Sequence-based Ordering and Deduplication
**Data Structure:** We used a JavaScript `Map` (`outOfOrder`) alongside a simple number reference for seq (`highestSeq`).

**Why:** A `Map` is perfect for this because it gives us instant O(1) inserts and lookups based on the sequence number. When packets arrive completely scrambled, we just slot them into the `Map` using the sequence number as the key.
Since we know exactly what number we are expecting next (`highestSeq + 1`), we can easily check the `Map` to see if it has arrived yet or not.
This is much faster and simpler than using a flat array because it provides $O(1)$ lookup and deletion times.
Deduplication is handled instantly by checking if the incoming sequence is less than or equal to `highestSeq`.


## Preventing Layout Shift During Tool Interruptions
**Strategy:** We solve this by modeling our chat messages as an ordered array of static, specialized blocks (`blocks: MessageBlock[]`):
* `TextBlock`: Holds streamed textual content.
* `ToolBlock`: Holds the tool metadata, execution status (`pending` | `completed`), and results payload.
We use standard CSS flexbox for the chat feed. 

When a `TOOL_CALL` arrives:
1. The active `TextBlock` is frozen. Its contents are saved as a static, independent React node.
2. A new `ToolBlock` is appended to the message blocks array.
3. When token streaming resumes (upon receiving `TOOL_RESULT` and subsequent tokens), then it detects that the last block was a tool block and automatically pushes a **brand-new** `TextBlock` below it.


## Reconnection State Recovery
**Approach:** We completely separate what the socket has "received" from what the UI has actually "consumed". 
- When a connection drops abnormally, the `onclose` callback is triggered. We calculate an exponential backoff retry interval:
   $$\text{delay} = \min(500 \times 2^{\text{attempts}}, 10000)\,\text{ms}$$
-  If the connection drops, we don't care what the socket had temporarily buffered. We only care about what the UI actually rendered. So, upon reconnection, we send a `RESUME` message with `last_seq: highestSeq.current`. The backend then replays everything the DOM hasn't consumed yet, ensuring no duplicate rendering and no skipped messages.   
- The socket receives raw packets, which might be skipped, dropped, or arrive out of order.
- The UI only "consumes" a packet when `executeMessage` is called. We only ever increment `highestSeq` right before `executeMessage`.


## Unmount and Lifecycle Protection (The `isUnmounted` Flag)
A common memory leak in WebSocket applications occurs when a component unmounts (e.g., page navigation or browser refresh). When the component unmounts, the cleanup function closes the active socket. However, this closure triggers the socket's `onclose` handler, which mistakenly schedules a reconnection timer and increments attempts in the background, creating background "zombie" connections.

We solved this by wrapping our `useEffect` in an `isUnmounted` boolean flag. On cleanup, we set `isUnmounted = true` and close the socket. Inside our `onclose`, `onmessage`, and `onerror` handlers, we check `if (isUnmounted) return;`. This immediately neutralizes any asynchronous callbacks from the closed socket, preventing duplicate mounting loops and preserving a clean session initialization on reload.


## Scaling to 50 Concurrent Agent Streams
In an operations dashboard rendering 50 concurrent agent streams  the main problem is **main-thread blocking**. 
**main-thread blocking caused by high-frequency React virtual DOM diffing and DOM repainting**. 
let's say 50 sockets deliver tokens at 30 packets/sec i.e 1,500 state updates per second, which will freeze the browser.

If we needed to show 50 active streams on an operations dashboard simultaneously:
1. **State Management:** Storing everything in single React state variables inside `ChatInterface.tsx` would cause the entire dashboard to re-render for every single token of every single stream.
We would need to switch to a global state manager (like Redux) and isolate the rendering so that only the specific stream component re-renders when it gets a token.
2. **requestAnimationFrame:** Processing WebSocket messages one by one would crash the browser with 50 active streams. We would need to queue incoming tokens and batch the UI updates using `requestAnimationFrame` 
3. **Virtualization:** Rendering 50 long chat histories simultaneously would destroy DOM performance. We would need to use windowing/virtualization (like `react-window`) to only render the chat messages that are currently visible on the screen.

## Handling 100x Longer Responses
If the agent generated full documents instead of short chat messages then we couldn't keep the entire document string in React state without causing heavy memory bloat and unwanted typing effects:
1. **Document Paginated Chunking:** Split the document state array into distinct sections or "pages" (e.g., 500-word blocks) and only render the currently visible page
2. **Direct Ref-Based DOM Appends:** Avoid updating the global React component state on every streaming token for long passages. Instead, write tokens directly to the DOM using a React `useRef` reference node (`element.textContent += token`). This bypasses React's virtual DOM reconciliation entirely during active streaming. 
