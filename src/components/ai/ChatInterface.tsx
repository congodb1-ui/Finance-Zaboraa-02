'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { apiPost } from '../../lib/api-client';
import type { AllowedQueryParams } from '../../lib/ai/chat';
import {
  Sparkles,
  Send,
  Database,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  AlertCircle,
  Bot,
  User,
  ShieldCheck,
  RotateCcw,
} from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  queryParams?: AllowedQueryParams;
  dataSummary?: any;
  error?: boolean;
}

const SUGGESTED_QUESTIONS = [
  'What did I spend on food this month?',
  'Which account has the highest balance?',
  'What were my top 5 expenses last quarter?',
  'How much did I earn from business last FY?',
];

const AI_ENABLED_KEY = 'zaboraa_ai_enabled';

export const ChatInterface: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [expandedDataIdx, setExpandedDataIdx] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const enabled = localStorage.getItem(AI_ENABLED_KEY) === 'true';
      setAiEnabled(enabled);
    }
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSendMessage = async (textToSend?: string) => {
    const question = (textToSend || inputValue).trim();
    if (!question || isLoading) return;

    if (!aiEnabled) {
      setMessages((prev) => [
        ...prev,
        {
          id: `msg_${Date.now()}`,
          sender: 'user',
          text: question,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
        {
          id: `msg_${Date.now()}_err`,
          sender: 'assistant',
          text: 'AI features are currently disabled. Please enable AI in Settings to use Ask-Your-Data.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          error: true,
        },
      ]);
      setInputValue('');
      return;
    }

    const userMsg: ChatMessage = {
      id: `msg_u_${Date.now()}`,
      sender: 'user',
      text: question,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue('');
    setIsLoading(true);

    try {
      const data = await apiPost('/api/ai/chat', { question });

      if (data && data.success) {
        const assistantMsg: ChatMessage = {
          id: `msg_a_${Date.now()}`,
          sender: 'assistant',
          text: data.answer,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          queryParams: data.queryParams,
          dataSummary: data.dataSummary,
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } else {
        const errorMsg: ChatMessage = {
          id: `msg_err_${Date.now()}`,
          sender: 'assistant',
          text: data.error || 'AI is currently unavailable. Try again later.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          error: true,
        };
        setMessages((prev) => [...prev, errorMsg]);
      }
    } catch {
      const errorMsg: ChatMessage = {
        id: `msg_err_${Date.now()}`,
        sender: 'assistant',
        text: 'AI is currently unavailable. Try again later.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        error: true,
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleDataDrawer = (msgId: string) => {
    setExpandedDataIdx(expandedDataIdx === msgId ? null : msgId);
  };

  const handleResetChat = () => {
    setMessages([]);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] max-w-4xl mx-auto w-full bg-white dark:bg-[#111827] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
      {/* Chat Header */}
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-900/50">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-heading font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                Ask-Your-Data (AI Assistant)
              </h2>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-semibold border border-indigo-200 dark:border-indigo-800">
                gemini-2.5-flash
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Zero SQL execution • Strictly parameterized queries over verified Indian ledger records
            </p>
          </div>
        </div>

        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleResetChat}
            leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
          >
            Clear
          </Button>
        )}
      </div>

      {/* AI Disabled Banner if applicable */}
      {!aiEnabled && (
        <div className="p-3 bg-amber-50 dark:bg-amber-950/60 border-b border-amber-200 dark:border-amber-900/60 flex items-center justify-between px-6 text-xs text-amber-900 dark:text-amber-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>AI features are disabled in master preferences.</span>
          </div>
          <button
            type="button"
            onClick={() => (window.location.hash = 'settings/ai')}
            className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
          >
            Enable in Settings →
          </button>
        </div>
      )}

      {/* Messages Scroll Area */}
      <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-4">
        {messages.length === 0 && (
          <div className="py-12 sm:py-16 text-center space-y-4 max-w-lg mx-auto">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-heading font-bold text-base text-slate-800 dark:text-slate-200">
                Ask anything about your income, spending & accounts
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Gemini translates questions into strict query parameters without raw SQL access, and synthesizes direct answers from your ledger figures.
              </p>
            </div>

            {/* Suggested Question Chips */}
            <div className="space-y-2 pt-2">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Suggested Questions
              </span>
              <div className="flex flex-col gap-2">
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => handleSendMessage(q)}
                    className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 hover:bg-indigo-50/60 dark:hover:bg-indigo-950/40 hover:border-indigo-200 dark:hover:border-indigo-800 text-xs text-slate-700 dark:text-slate-300 text-left transition-colors flex items-center justify-between group cursor-pointer"
                  >
                    <span>{q}</span>
                    <Sparkles className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {messages.map((msg) => {
          const isUser = msg.sender === 'user';
          const isExpanded = expandedDataIdx === msg.id;

          return (
            <div
              key={msg.id}
              className={`flex gap-3 max-w-2xl ${isUser ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}
            >
              {/* Avatar Icon */}
              <div
                className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 text-xs ${
                  isUser
                    ? 'bg-indigo-600 text-white'
                    : msg.error
                    ? 'bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400'
                    : 'bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400'
                }`}
              >
                {isUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
              </div>

              {/* Message Bubble */}
              <div className="space-y-1.5 flex-1">
                <div
                  className={`p-3.5 rounded-2xl text-xs sm:text-sm leading-relaxed ${
                    isUser
                      ? 'bg-indigo-600 text-white rounded-tr-xs'
                      : msg.error
                      ? 'bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-900 dark:text-red-200 rounded-tl-xs'
                      : 'bg-slate-100 dark:bg-slate-800/80 text-slate-800 dark:text-slate-200 rounded-tl-xs'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                </div>

                {/* Collapsible Data Used Section (for Assistant responses) */}
                {!isUser && msg.queryParams && (
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 overflow-hidden text-xs">
                    <button
                      type="button"
                      onClick={() => toggleDataDrawer(msg.id)}
                      className="w-full px-3 py-1.5 flex items-center justify-between text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors cursor-pointer select-none"
                    >
                      <div className="flex items-center gap-1.5 text-[11px] font-medium">
                        <Database className="w-3 h-3 text-indigo-500" />
                        <span>Data used (Verified parameters)</span>
                      </div>
                      {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>

                    {isExpanded && (
                      <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-950/50 font-mono text-[11px] space-y-1.5">
                        <div className="text-slate-400 text-[10px]">
                          Applied Filter Parameters (Allowlist Validated):
                        </div>
                        <pre className="p-2 rounded bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 overflow-x-auto">
                          {JSON.stringify(msg.queryParams, null, 2)}
                        </pre>
                        {msg.dataSummary && (
                          <div className="text-[10px] text-slate-500 pt-1">
                            Records matched: {msg.dataSummary.totalRecordsFound} • Metric calculated:{' '}
                            ₹{msg.dataSummary.metricCalculated?.toLocaleString('en-IN') || 0}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div
                  className={`text-[10px] text-slate-400 px-1 ${
                    isUser ? 'text-right' : 'text-left'
                  }`}
                >
                  {msg.timestamp}
                </div>
              </div>
            </div>
          );
        })}

        {isLoading && (
          <div className="flex gap-3 max-w-2xl mr-auto">
            <div className="w-7 h-7 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <Bot className="w-3.5 h-3.5" />
            </div>
            <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-800/80 rounded-tl-xs flex items-center gap-2 text-xs text-slate-500">
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
              <span>Analyzing parameters and calculating figures...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Box Footer */}
      <div className="p-3 sm:p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={
              aiEnabled
                ? 'Ask a question about your finances (e.g. What were my top 5 expenses last month?)...'
                : 'Enable AI in Settings to ask questions...'
            }
            disabled={!aiEnabled || isLoading}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 disabled:opacity-60 transition-all"
          />

          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={!inputValue.trim() || isLoading || !aiEnabled}
            leftIcon={<Send className="w-3.5 h-3.5" />}
          >
            Ask
          </Button>
        </form>
      </div>
    </div>
  );
};
