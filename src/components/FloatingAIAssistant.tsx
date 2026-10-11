import { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  X,
  Send,
  Loader2,
  Bot,
  Wrench,
} from 'lucide-react';
import { executeCityAssistantQuery } from '@/services/aiAssistantService';
import type { AIMessage, CityInfo } from '@/types';

interface FloatingAIAssistantProps {
  currentCity: CityInfo;
  geminiApiKey?: string;
  onOpenReportModal?: () => void;
  onOpenTrackModal?: (id?: string) => void;
}

export function FloatingAIAssistant({
  currentCity,
  geminiApiKey,
  onOpenReportModal,
  onOpenTrackModal,
}: FloatingAIAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<AIMessage[]>([
    {
      id: 'welcome_float',
      role: 'assistant',
      content: `Namaste! I am your **CityPulse AI Assistant** for **${currentCity.name}**.\n\nI connect directly to live municipal telematics, Open-Meteo atmospheric sensors, and OpenStreetMap infrastructure. Ask me anything or tap a quick query below!`,
      timestamp: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading, isOpen]);

  async function handleSend(queryToSend?: string) {
    const text = (queryToSend || input).trim();
    if (!text || loading) return;

    // Check if user is asking to track an issue directly
    const trackMatch = text.match(/CP-2026-\d{6}/i);
    if (trackMatch && onOpenTrackModal) {
      onOpenTrackModal(trackMatch[0].toUpperCase());
    }

    if (text.toLowerCase().includes('report') && text.toLowerCase().includes('issue') && onOpenReportModal) {
      onOpenReportModal();
    }

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
      const resp = await executeCityAssistantQuery(text, {
        city: currentCity,
        geminiApiKey,
      });
      setMessages((prev) => [...prev, resp]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: 'assistant',
          content: 'Unable to connect to live telemetry services at this moment. Please try again.',
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const QUICK_PROMPTS = [
    `What's happening near me?`,
    `Today's city summary`,
    `Find hospitals near ${currentCity.name}`,
    `Check air quality and AQI`,
    `Show active civic alerts`,
    `Track issue CP-2026-104921`,
  ];

  return (
    <>
      {/* Floating Action Trigger Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-40 px-4 py-3 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold text-xs shadow-xl shadow-blue-500/30 hover:scale-105 active:scale-95 transition-all flex items-center gap-2.5 group"
          aria-label="Open CityPulse AI Assistant"
        >
          <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-white animate-pulse" />
          </div>
          <span>CityPulse AI</span>
        </button>
      )}

      {/* Floating Chat Drawer / Window */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 z-50 w-[360px] sm:w-[420px] max-w-[calc(100vw-2rem)] h-[540px] max-h-[85vh] bg-white dark:bg-citynavy-card border border-slate-200 dark:border-citynavy-border rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-slide-down">
          {/* Header */}
          <div className="px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div>
                <h4 className="text-xs font-bold leading-tight">CityPulse AI &bull; {currentCity.name}</h4>
                <p className="text-[10px] text-blue-100">Live Data Grounded Assistant</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-lg hover:bg-white/20 transition-colors text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Prompts Carousel */}
          <div className="px-3 py-2 bg-slate-50 dark:bg-citynavy-secondary/80 border-b border-slate-100 dark:border-citynavy-border flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            {QUICK_PROMPTS.map((prompt, i) => (
              <button
                key={i}
                onClick={() => handleSend(prompt)}
                className="px-2.5 py-1 rounded-lg bg-white dark:bg-citynavy-card border border-slate-200 dark:border-citynavy-border/60 text-[10px] font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap hover:bg-blue-50 dark:hover:bg-blue-950/40 hover:text-citynavy-accent transition-colors"
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Messages Log */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex items-start gap-2 ${
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {msg.role !== 'user' && (
                  <div className="w-6 h-6 rounded-lg bg-blue-500/10 text-citynavy-accent flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bot className="w-3.5 h-3.5" />
                  </div>
                )}
                <div
                  className={`max-w-[82%] rounded-2xl p-3 text-xs leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-citynavy-accent text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-citynavy-secondary border border-slate-200/50 dark:border-citynavy-border text-slate-800 dark:text-slate-200'
                  }`}
                >
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div className="mb-2 p-1.5 rounded-lg bg-white/60 dark:bg-citynavy-card/60 text-[10px] font-mono flex items-center gap-1 text-citynavy-accent">
                      <Wrench className="w-3 h-3" />
                      <span>{msg.toolCalls[0].name}</span>
                    </div>
                  )}
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Loader2 className="w-4 h-4 text-citynavy-accent animate-spin" />
                <span>CityPulse AI is analyzing live city telematics...</span>
              </div>
            )}
            <div ref={scrollRef} />
          </div>

          {/* Input Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="p-3 bg-white dark:bg-citynavy-card border-t border-slate-100 dark:border-citynavy-border flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Ask about traffic, weather, hospitals in ${currentCity.name}...`}
              className="flex-1 px-3 py-2 text-xs bg-slate-50 dark:bg-citynavy-secondary border border-slate-200 dark:border-citynavy-border rounded-xl text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-citynavy-accent"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="p-2 rounded-xl bg-citynavy-accent text-white hover:bg-blue-600 transition-colors disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
