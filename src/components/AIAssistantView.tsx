import { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Send,
  Loader2,
  Bot,
  User as UserIcon,
  Wrench,
} from 'lucide-react';
import { executeCityAssistantQuery } from '@/services/aiAssistantService';
import type { AIMessage, CityInfo } from '@/types';

interface AIAssistantViewProps {
  currentCity: CityInfo;
  geminiApiKey?: string;
}

export function AIAssistantView({ currentCity, geminiApiKey }: AIAssistantViewProps) {
  const [messages, setMessages] = useState<AIMessage[]>([
    {
      id: 'welcome_1',
      role: 'assistant',
      content: `Hello! I am your **CityPulse Smart City Assistant** for **${currentCity.name}**.\n\nI am connected directly to live application tools. I can look up verified nearby hospitals and schools, fetch atmospheric and air quality observations, scan active civic alerts, and compute road routes.\n\nTry one of the quick prompts below or ask a question!`,
      timestamp: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function handleSend(textToSend?: string) {
    const text = (textToSend || input).trim();
    if (!text || loading) return;

    const userMsg: AIMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const responseMsg = await executeCityAssistantQuery(text, {
        city: currentCity,
        geminiApiKey,
      });
      setMessages((prev) => [...prev, responseMsg]);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Connection timeout.';
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: 'assistant',
          content: `An error occurred while executing the query tool: ${errorMsg}. Please retry.`,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const promptSuggestions = [
    `Find hospitals within 5 km of ${currentCity.name}`,
    `Locate the nearest police station`,
    `What is the current weather and AQI?`,
    `Summarize currently available civic alerts`,
    `Find nearby schools and pharmacies`,
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <div className="bg-white dark:bg-citynavy-card border border-slate-200 dark:border-citynavy-border rounded-2xl p-5 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-citynavy-text">
              AI City Intelligence Assistant
            </h2>
            <p className="text-xs text-slate-500 dark:text-citynavy-muted">
              Live tool-calling assistant for {currentCity.label}
            </p>
          </div>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
          Tools Connected
        </span>
      </div>

      {/* Chat Messages Log */}
      <div className="bg-white dark:bg-citynavy-card border border-slate-200 dark:border-citynavy-border rounded-2xl p-5 shadow-sm h-[520px] flex flex-col">
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex items-start gap-3 ${
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              {msg.role !== 'user' && (
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-citynavy-accent flex-shrink-0 mt-0.5">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div
                className={`max-w-2xl rounded-2xl p-4 text-xs leading-relaxed space-y-2.5 ${
                  msg.role === 'user'
                    ? 'bg-citynavy-accent text-white shadow-md shadow-blue-500/20'
                    : 'bg-slate-50 dark:bg-citynavy-secondary/60 border border-slate-100 dark:border-citynavy-border text-slate-800 dark:text-slate-200'
                }`}
              >
                {/* Tool Calling Execution Badge */}
                {msg.toolCalls && msg.toolCalls.length > 0 && (
                  <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-citynavy-card border border-slate-200 dark:border-citynavy-border/60 space-y-1.5 text-[11px]">
                    <div className="flex items-center gap-1.5 font-bold text-citynavy-accent">
                      <Wrench className="w-3.5 h-3.5" />
                      <span>Tool Invoked: {msg.toolCalls[0].name}</span>
                    </div>
                    <div className="text-slate-500 dark:text-slate-400 font-mono text-[10px]">
                      Args: {JSON.stringify(msg.toolCalls[0].args)}
                    </div>
                  </div>
                )}

                <div className="whitespace-pre-wrap font-sans">{msg.content}</div>

                <div
                  className={`text-[10px] text-right ${
                    msg.role === 'user' ? 'text-blue-100' : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>

              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 flex-shrink-0 mt-0.5">
                  <UserIcon className="w-4 h-4" />
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-citynavy-accent flex-shrink-0 mt-0.5">
                <Bot className="w-4 h-4" />
              </div>
              <div className="bg-slate-50 dark:bg-citynavy-secondary/60 border border-slate-100 dark:border-citynavy-border rounded-2xl p-4 text-xs flex items-center gap-2 text-slate-500">
                <Loader2 className="w-4 h-4 text-citynavy-accent animate-spin" />
                <span>Executing geospatial query & parsing verified records...</span>
              </div>
            </div>
          )}

          <div ref={scrollRef} />
        </div>

        {/* Suggested Quick Prompts */}
        <div className="pt-3 border-t border-slate-100 dark:border-citynavy-border flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1">
          {promptSuggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleSend(s)}
              className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-citynavy-secondary hover:bg-slate-200 dark:hover:bg-slate-800 text-[11px] font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap transition-colors"
            >
              {s}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="mt-3 flex items-center gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about nearby hospitals, routes, weather, or alerts in your city..."
            className="flex-1 px-4 py-2.5 text-xs bg-slate-50 dark:bg-citynavy-secondary border border-slate-200 dark:border-citynavy-border rounded-xl text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-citynavy-accent"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="p-2.5 rounded-xl bg-citynavy-accent text-white hover:bg-blue-600 transition-colors disabled:opacity-50 shadow-md shadow-blue-500/20"
            aria-label="Send message"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
