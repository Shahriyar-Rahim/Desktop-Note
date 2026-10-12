import React, { useState } from 'react';

export default function App() {
    const [reply, setReply] = useState('');

    async function ping() {
        const result = await window.api.ping('hello from React');
        setReply(result);
    }

    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-amber-50 text-stone-800">
        <h1 className="text-3xl font-bold">Hello, Desktop Notes</h1>
        <p>React is rendering inside an Electron window.</p>
        <button
          onClick={ping}
          className="rounded-lg bg-amber-600 px-4 py-2 font-medium text-white hover:bg-amber-700"
        >
          Ping the main process
        </button>
        <p data-testid="reply">{reply}</p>
      </div>
    );
}
