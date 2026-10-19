"use client";

import { useState, useRef, useEffect } from "react";
import { api } from "~/trpc/react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { ScrollArea } from "~/components/ui/scroll-area";
import { MessageCircle, Bot, Loader2, ChevronRight, ChevronDown, Square } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { usePathname } from "next/navigation";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export function HelpChat() {
  const pathname = usePathname();
  const utils = api.useUtils();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Hi there! I'm your Smart Meal Planner Assistant 🤖" },
    { role: "assistant", content: "Register to get personalized AI meal plans 👇" },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const scrollHeight = textareaRef.current.scrollHeight;
      const lineHeight = 18;
      const maxHeight = lineHeight * 4;
      
      textareaRef.current.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
      textareaRef.current.style.overflowY = scrollHeight > maxHeight ? "auto" : "hidden";
    }
  }, [input]);

  const askStream = api.help.askStream.useMutation();
  const swapMeal = api.plans.swapMeal.useMutation();
  const regenerateDay = api.plans.regenerateDay.useMutation();
  
  const lastActionRef = useRef<string | null>(null);

  // Improved Auto-scroll: Only scrolls to bottom if user is already near the bottom
  useEffect(() => {
    if (scrollRef.current) {
      const viewport = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (viewport) {
        const isNearBottom = viewport.scrollHeight - viewport.scrollTop <= viewport.clientHeight + 100;
        if (isNearBottom) {
          viewport.scrollTop = viewport.scrollHeight;
        }
      }
    }
  }, [messages, isTyping]);

  function handleStop() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsTyping(false);
      setMessages(prev => [...prev, { role: "assistant", content: " *Generation stopped.*" }]);
    }
  }

  async function handleSend() {
    if (!input.trim() || isTyping) return;

    const userMessage: Message = { role: "user", content: input };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsTyping(true);
    
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    abortControllerRef.current = new AbortController();

    try {
      const stream = await askStream.mutateAsync({
        messages: newMessages,
        pathname: pathname ?? "",
      });

      for await (const chunk of stream) {
        if (abortControllerRef.current?.signal.aborted) break;
        setIsTyping(false);
        
        // Handle Action Triggers by calling the standard plans mutations
        if (chunk.action) {
          const actionId = JSON.stringify(chunk.action);
          if (lastActionRef.current !== actionId) {
            lastActionRef.current = actionId;
            setMessages((prev) => [...prev, { role: "assistant", content: "⚡ *Refining your plan...*" }]);
            
            const { action, dayNumber, mealType, recipeHint } = chunk.action;

            if (action === "REPLACE_MEAL" && mealType) {
              swapMeal.mutate({ 
                dayNumber, 
                mealType, 
                hint: recipeHint 
              }, {
                onSuccess: () => {
                  void utils.plans.getActivePlan.invalidate();
                  setMessages((prev) => [...prev, { role: "assistant", content: "✅ **Meal updated!**" }]);
                },
                onError: () => setMessages((prev) => [...prev, { role: "assistant", content: "❌ Failed to update meal." }])
              });
            } else if (action === "REGENERATE_DAY") {
              regenerateDay.mutate({ 
                dayNumber, 
                hint: recipeHint 
              }, {
                onSuccess: () => {
                  void utils.plans.getActivePlan.invalidate();
                  setMessages((prev) => [...prev, { role: "assistant", content: "✅ **Day regenerated!**" }]);
                },
                onError: () => setMessages((prev) => [...prev, { role: "assistant", content: "❌ Failed to regenerate day." }])
              });
            }
          }
        }

        if (chunk.content) {
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.role === "assistant" && prev.length > newMessages.length) {
                if (last.content.startsWith("⚡") || last.content.startsWith("✅") || last.content.startsWith("❌")) {
                   return [...prev, { role: "assistant", content: chunk.content }];
                }
                return [...prev.slice(0, -1), { role: "assistant", content: last.content + chunk.content }];
              }
              return [...prev, { role: "assistant", content: chunk.content }];
            });
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.error("Stream error:", err);
      setIsTyping(false);
      setMessages((prev) => [...prev, { role: "assistant", content: "Error. Please try again." }]);
    } finally {
      setIsTyping(false);
      abortControllerRef.current = null;
    }
  }

  return (
    <div className="fixed bottom-20 right-4 z-50 flex flex-col items-end">
      {isOpen ? (
        <Card className="mb-4 w-[320px] md:w-[450px] shadow-2xl border-none overflow-hidden animate-in slide-in-from-bottom-5 duration-300 rounded-3xl flex flex-col h-[60vh] md:h-[650px]">
          <CardHeader className="flex flex-row items-center justify-between py-3 bg-primary text-primary-foreground space-y-0 px-5 shrink-0">
            <div className="flex items-center gap-2">
               <Bot className="h-5 w-5" />
               <CardTitle className="text-base font-bold tracking-tight">Concierge</CardTitle>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-white hover:bg-white/20 rounded-full"
                onClick={() => setIsOpen(false)}
              >
                <ChevronDown className="h-6 w-6" />
              </Button>
            </div>
          </CardHeader>

          <CardContent className="p-0 bg-background relative flex-1 min-h-0">
            <ScrollArea className="h-full" ref={scrollRef}>
              <div className="p-3 space-y-4">
                {messages.map((m, i) => (
                  <div key={i} className="flex flex-col gap-1 w-full">
                    <div className={`flex w-full ${m.role === "assistant" ? "justify-start" : "justify-end"}`}>
                      <div className={`max-w-[90%] rounded-[18px] px-3.5 py-2 text-[12px] md:text-sm shadow-sm leading-tight overflow-hidden ${
                          m.role === "assistant"
                            ? "bg-muted text-foreground rounded-tl-none border border-border/50"
                            : "bg-primary text-primary-foreground rounded-tr-none"
                        }`}
                      >
                        <div className="prose prose-xs md:prose-sm dark:prose-invert max-w-none prose-p:my-0 break-words whitespace-pre-wrap">
                          <ReactMarkdown
                            components={{
                              h3: ({ children }) => <h3 className="text-[13px] md:text-base font-black uppercase tracking-tight mt-3 mb-1 text-primary italic">{children}</h3>,
                              strong: ({ children }) => <span className="font-black text-foreground underline decoration-primary/30 decoration-2 underline-offset-2">{children}</span>,
                              ul: ({ children }) => <ul className="list-disc ml-4 mt-1.5 mb-1.5 space-y-1 italic">{children}</ul>,
                              ol: ({ children }) => <ol className="list-decimal ml-4 mt-1.5 mb-1.5 space-y-1">{children}</ol>,
                              li: ({ children }) => <li className="leading-tight">{children}</li>,
                              blockquote: ({ children }) => <div className="border-l-2 border-primary/50 pl-2 py-0.5 my-2 bg-primary/5 rounded-r-sm italic text-muted-foreground">{children}</div>,
                            }}
                          >
                            {m.content}
                          </ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {isTyping && (
                  <div className="flex justify-start w-full">
                    <div className="bg-muted rounded-[18px] px-3.5 py-2 rounded-tl-none border border-border/50">
                      <Loader2 className="h-3 w-3 animate-spin text-primary" />
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>

          <CardFooter className="p-2.5 bg-background border-t">
            <div className="flex w-full items-center gap-2 bg-muted/30 rounded-2xl p-1 focus-within:bg-background focus-within:ring-1 focus-within:ring-primary/20 transition-all">
              <Textarea
                ref={textareaRef}
                placeholder="Message..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                className="min-h-[36px] max-h-[80px] resize-none border-none bg-transparent px-3 py-2 focus-visible:ring-0 shadow-none text-[12px] leading-tight"
                rows={1}
              />
              <div className="flex items-center gap-1 px-1">
                {isTyping && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 rounded-xl shrink-0 hover:bg-black/5"
                    onClick={handleStop}
                  >
                    <Square className="h-3.5 w-3.5 fill-black text-black" />
                  </Button>
                )}
                <Button 
                  size="icon" 
                  className="h-8 w-8 rounded-xl shrink-0" 
                  onClick={handleSend} 
                  disabled={isTyping || !input.trim()}
                >
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </CardFooter>
        </Card>
      ) : (
        <Button
          size="icon"
          className="h-12 w-12 rounded-full shadow-2xl bg-primary ring-4 ring-background transition-transform active:scale-90"
          onClick={() => setIsOpen(true)}
        >
          <MessageCircle className="h-6 w-6 text-white" />
        </Button>
      )}
    </div>
  );
}
