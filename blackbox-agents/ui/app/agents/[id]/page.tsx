"use client";

import {
  ArrowLeft,
  Play,
  Square,
  RotateCcw,
  Zap,
  Settings,
  Send,
  CheckCircle,
  XCircle,
  Clock,
  CircleDot,
} from "lucide-react";
import Link from "next/link";
import { use, useState, useRef, useEffect } from "react";
import type { TaskStatus } from "@/lib/types";
import { StatusDot } from "@/components/status-dot";
import { TaskForm } from "@/components/task-form";
import { TerminalPane } from "@/components/terminal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAgents, useTasks, useMessages, useWs } from "@/lib/ws";

const TASK_ICONS: Record<TaskStatus, React.ReactNode> = {
  queued: <Clock className="h-3.5 w-3.5 text-zinc-500" />,
  running: <CircleDot className="h-3.5 w-3.5 text-blue-400" />,
  completed: <CheckCircle className="h-3.5 w-3.5 text-green-400" />,
  failed: <XCircle className="h-3.5 w-3.5 text-red-400" />,
  cancelled: <XCircle className="h-3.5 w-3.5 text-zinc-600" />,
};

export default function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { agents } = useAgents();
  const { tasks, refetch: refetchTasks } = useTasks(id);
  const { messages } = useMessages(id);
  const { request } = useWs();

  const agent = agents.find((a) => a.id === id);
  const [msgInput, setMsgInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!agent) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Agent not found.</p>
      </div>
    );
  }

  const start = () => void request("agents.start", { id }).catch(console.error);
  const stop = () => void request("agents.stop", { id }).catch(console.error);
  const restart = () => void request("agents.restart", { id }).catch(console.error);
  const interrupt = () => void request("agents.interrupt", { id }).catch(console.error);

  const sendMsg = () => {
    if (!msgInput.trim()) {
      return;
    }
    void request("agents.write", { id, text: msgInput.trim() }).catch(console.error);
    setMsgInput("");
  };

  const dispatchTask = (taskId: string) => {
    void request("tasks.dispatch", { id: taskId })
      .then(() => refetchTasks())
      .catch((e: unknown) => alert(e instanceof Error ? e.message : String(e)));
  };

  const completeTask = (taskId: string) => {
    void request("tasks.complete", { id: taskId }).then(() => refetchTasks());
  };

  const cancelTask = (taskId: string) => {
    void request("tasks.cancel", { id: taskId }).then(() => refetchTasks());
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/agents">
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <span className="font-semibold">{agent.name}</span>
            <span className="text-xs text-muted-foreground">{agent.type}</span>
            <StatusDot status={agent.status} showLabel />
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Link href={`/agents/${id}/settings`}>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <Settings className="h-4 w-4" />
            </Button>
          </Link>
          {agent.status === "offline" ? (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={start}>
              <Play className="h-3 w-3" /> Start
            </Button>
          ) : (
            <>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={stop}>
                <Square className="h-3 w-3" /> Stop
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1.5" onClick={restart}>
                <RotateCcw className="h-3 w-3" /> Restart
              </Button>
              {agent.status === "working" && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs gap-1.5 text-amber-400 hover:text-amber-300"
                  onClick={interrupt}
                >
                  <Zap className="h-3 w-3" /> Interrupt
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Split layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Terminal — 60% */}
        <div className="flex flex-col" style={{ width: "60%" }}>
          <TerminalPane agentId={id} className="flex-1" />

          {/* Message input */}
          <div className="flex items-center gap-2 p-3 border-t border-border shrink-0 bg-card">
            <Input
              placeholder="Type a message…"
              value={msgInput}
              onChange={(e) => setMsgInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMsg();
                }
              }}
              className="text-sm font-mono"
            />
            <Button size="icon" className="h-9 w-9 shrink-0" onClick={sendMsg}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Sidebar — 40% */}
        <div
          className="flex flex-col border-l border-border overflow-hidden"
          style={{ width: "40%" }}
        >
          <Tabs defaultValue="tasks" className="flex flex-col h-full">
            <div className="px-4 pt-3 pb-2 border-b border-border shrink-0 flex items-center justify-between">
              <TabsList className="h-8">
                <TabsTrigger value="tasks" className="text-xs h-7">
                  Tasks
                </TabsTrigger>
                <TabsTrigger value="messages" className="text-xs h-7">
                  Messages
                </TabsTrigger>
              </TabsList>
              <TabsContent value="tasks" className="mt-0">
                <TaskForm agents={[agent]} defaultAgentId={id} onCreated={refetchTasks} />
              </TabsContent>
            </div>

            {/* Tasks */}
            <TabsContent value="tasks" className="flex-1 overflow-y-auto m-0 p-0">
              {tasks.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-sm text-muted-foreground">No tasks yet.</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {[...tasks].toReversed().map((task) => (
                    <div key={task.id} className="p-3 hover:bg-accent/20">
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 shrink-0">{TASK_ICONS[task.status]}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{task.title}</p>
                          {task.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                              {task.description}
                            </p>
                          )}
                          <p className="text-xs text-zinc-600 mt-1 font-mono">
                            {new Date(task.createdAt).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                      {task.status === "queued" && (
                        <div className="flex gap-1.5 mt-2 ml-6">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-xs"
                            onClick={() => dispatchTask(task.id)}
                          >
                            Dispatch
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-xs"
                            onClick={() => cancelTask(task.id)}
                          >
                            Cancel
                          </Button>
                        </div>
                      )}
                      {task.status === "running" && (
                        <div className="flex gap-1.5 mt-2 ml-6">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-xs text-green-400 border-green-500/30"
                            onClick={() => completeTask(task.id)}
                          >
                            Mark Done
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-xs"
                            onClick={() => cancelTask(task.id)}
                          >
                            Cancel
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Messages */}
            <TabsContent value="messages" className="flex-1 overflow-y-auto m-0 p-0">
              {messages.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-sm text-muted-foreground">No messages yet.</p>
                </div>
              ) : (
                <div className="p-3 space-y-3">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.direction === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                          msg.direction === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-zinc-800 text-foreground"
                        }`}
                      >
                        <p className="font-mono text-xs whitespace-pre-wrap">{msg.content}</p>
                        <p className="text-xs opacity-50 mt-1">
                          {new Date(msg.ts).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
