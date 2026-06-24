"use client";

import { useEffect, useRef, useState } from "react";
import {
  useRenderTool,
  CopilotChat,
  useConfigureSuggestions,
  useAgent,
} from "@copilotkit/react-core/v2";
import { z } from "zod";

export default function Page() {
  return (
    <main>
      <Chat />
    </main>
  );
}

const Chat = () => {
  const { agent } = useAgent({ agentId: "backend_tool_rendering" });

  const [mounted, setMounted] = useState(false);
  const [notificationsSupported, setNotificationsSupported] = useState(false);
  const [permission, setPermission] =
    useState<NotificationPermission>("default");

  const prevIsRunning = useRef(false);
  const runStartMessagesCount = useRef(0);
  const pendingHiddenCompletion = useRef(false);
  const lastNotifiedRun = useRef<number | null>(null);
  const pageHiddenRef = useRef(false);

  useEffect(() => {
    setMounted(true);

    if (typeof window !== "undefined" && "Notification" in window) {
      setNotificationsSupported(true);
      setPermission(Notification.permission);
    }
  }, []);

  useEffect(() => {
    if (!mounted || typeof document === "undefined") return;

    const updateVisibility = () => {
      pageHiddenRef.current =
        document.visibilityState === "hidden" || !document.hasFocus();
    };

    updateVisibility();

    document.addEventListener("visibilitychange", updateVisibility);
    window.addEventListener("blur", updateVisibility);
    window.addEventListener("focus", updateVisibility);

    return () => {
      document.removeEventListener("visibilitychange", updateVisibility);
      window.removeEventListener("blur", updateVisibility);
      window.removeEventListener("focus", updateVisibility);
    };
  }, [mounted]);

  const handleRequestPermission = async () => {
    if (!mounted || typeof window === "undefined" || !("Notification" in window))
      return;

    const result = await Notification.requestPermission();
    setPermission(result);
  };

  const extractNotificationText = (content: unknown): string => {
    if (typeof content === "string") {
      return content.trim();
    }

    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (typeof part === "string") return part;

          if (
            part &&
            typeof part === "object" &&
            "text" in part &&
            typeof (part as { text?: unknown }).text === "string"
          ) {
            return (part as { text: string }).text;
          }

          return "";
        })
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
    }

    if (
      content &&
      typeof content === "object" &&
      "text" in content &&
      typeof (content as { text?: unknown }).text === "string"
    ) {
      return (content as { text: string }).text.trim();
    }

    return "";
  };

  useEffect(() => {
    if (!mounted || !agent || !notificationsSupported) return;

    const messages = agent.messages || [];

    if (!prevIsRunning.current && agent.isRunning) {
      runStartMessagesCount.current = messages.length;
      pendingHiddenCompletion.current = false;
      lastNotifiedRun.current = null;
    }

    if (prevIsRunning.current && !agent.isRunning) {
      pendingHiddenCompletion.current = pageHiddenRef.current;
    }

    if (!agent.isRunning && pendingHiddenCompletion.current) {
      const newMessages = messages.slice(runStartMessagesCount.current);

      const lastAssistantMsg = [...newMessages]
        .reverse()
        .find((msg) => msg.role === "assistant");

      const notificationText = extractNotificationText(
        lastAssistantMsg?.content
      ).slice(0, 180);

      const runId = runStartMessagesCount.current;

      if (
        notificationText &&
        permission === "granted" &&
        lastNotifiedRun.current !== runId
      ) {
        const notification = new Notification("Copilot Assistant", {
          body: notificationText,
          icon: "/favicon.ico",
          tag: `copilot-run-${runId}`,
        });

        notification.onclick = () => {
          window.focus();
          notification.close();
        };

        lastNotifiedRun.current = runId;
        pendingHiddenCompletion.current = false;
      }
    }

    prevIsRunning.current = agent.isRunning;
  }, [
    mounted,
    agent,
    agent?.isRunning,
    agent?.messages,
    notificationsSupported,
    permission,
  ]);

  useRenderTool({
    name: "get_weather",
    parameters: z.object({
      location: z.string(),
    }),
    render: ({ args, result, status }: any) => {
      if (status !== "complete") {
        return (
          <div className="bg-[#667eea] text-white p-4 rounded-lg max-w-md">
            <span className="animate-spin">⚙️ Retrieving weather...</span>
          </div>
        );
      }

      let parsed: any = result;
      if (typeof parsed === "string") {
        try {
          parsed = JSON.parse(parsed);
        } catch {
          parsed = {};
        }
      }

      parsed = parsed ?? {};

      const weatherResult: WeatherToolResult = {
        temperature: parsed.temperature ?? 0,
        conditions: parsed.conditions ?? "clear",
        humidity: parsed.humidity ?? 0,
        windSpeed: parsed.wind_speed ?? parsed.windSpeed ?? 0,
        feelsLike:
          parsed.feels_like ?? parsed.feelsLike ?? parsed.temperature ?? 0,
      };

      const themeColor = getThemeColor(weatherResult.conditions);

      return (
        <WeatherCard
          location={args.location}
          themeColor={themeColor}
          result={weatherResult}
          status={status || "complete"}
        />
      );
    },
  });

  useConfigureSuggestions({
    suggestions: [
      {
        title: "Weather in San Francisco",
        message: "What's the weather like in San Francisco?",
      },
      {
        title: "Weather in New York",
        message: "Tell me about the weather in New York.",
      },
      {
        title: "Weather in Tokyo",
        message: "How's the weather in Tokyo today?",
      },
    ],
    available: "always",
  });

  return (
    <div className="flex flex-col justify-center items-center h-full w-full p-4 md:p-8">
      {mounted && notificationsSupported && permission === "default" && (
        <div className="bg-indigo-600/90 backdrop-blur text-white px-5 py-4 rounded-2xl mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between shadow-xl border border-indigo-500/20 max-w-6xl w-full transition-all duration-300 gap-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl select-none">🔔</span>
            <div>
              <p className="font-semibold text-sm">Enable Task Notifications</p>
              <p className="text-xs text-white/80 mt-0.5">
                Stay updated! Get browser alerts when the assistant completes
                runs while this tab is minimized or out of focus.
              </p>
            </div>
          </div>

          <button
            onClick={handleRequestPermission}
            className="bg-white text-indigo-600 font-semibold px-4 py-2 rounded-xl text-xs hover:bg-indigo-50 active:scale-95 transition-all shadow-md cursor-pointer whitespace-nowrap self-stretch sm:self-auto text-center"
          >
            Enable Notifications
          </button>
        </div>
      )}

      {mounted && notificationsSupported && permission === "denied" && (
        <div className="bg-amber-50 text-amber-900 px-5 py-4 rounded-2xl mb-6 max-w-6xl w-full border border-amber-200">
          <p className="font-semibold text-sm">Notifications are blocked</p>
          <p className="text-xs mt-1">
            Please enable browser notifications for this site from your browser
            settings to receive completion alerts.
          </p>
        </div>
      )}

      {mounted && !notificationsSupported && (
        <div className="bg-slate-100 text-slate-800 px-5 py-4 rounded-2xl mb-6 max-w-6xl w-full border border-slate-200">
          <p className="font-semibold text-sm">
            Notifications are not supported
          </p>
          <p className="text-xs mt-1">
            This browser does not support the Notification API in the current
            environment.
          </p>
        </div>
      )}

      <div className="flex-1 h-full w-full md:w-8/10 max-h-[85vh] rounded-lg">
        {mounted ? (
          <CopilotChat
            agentId="backend_tool_rendering"
            className="h-full rounded-2xl max-w-6xl mx-auto"
          />
        ) : (
          <div className="h-full min-h-[60vh] rounded-2xl max-w-6xl mx-auto bg-slate-100 animate-pulse" />
        )}
      </div>
    </div>
  );
};

interface WeatherToolResult {
  temperature: number;
  conditions: string;
  humidity: number;
  windSpeed: number;
  feelsLike: number;
}

function getThemeColor(conditions: string): string {
  const conditionLower = conditions.toLowerCase();

  if (conditionLower.includes("clear") || conditionLower.includes("sunny")) {
    return "#667eea";
  }
  if (conditionLower.includes("rain") || conditionLower.includes("storm")) {
    return "#4A5568";
  }
  if (conditionLower.includes("cloud")) {
    return "#718096";
  }
  if (conditionLower.includes("snow")) {
    return "#63B3ED";
  }

  return "#764ba2";
}

function WeatherCard({
  location,
  themeColor,
  result,
}: {
  location?: string;
  themeColor: string;
  result: WeatherToolResult;
  status: "inProgress" | "executing" | "complete";
}) {
  return (
    <div
      data-testid="weather-card"
      style={{ backgroundColor: themeColor }}
      className="rounded-xl mt-6 mb-4 max-w-md w-full"
    >
      <div className="bg-white/20 p-4 w-full">
        <div className="flex items-center justify-between">
          <div>
            <h3
              data-testid="weather-city"
              className="text-xl font-bold text-white capitalize"
            >
              {location}
            </h3>
            <p className="text-white">Current Weather</p>
          </div>
          <WeatherIcon conditions={result.conditions} />
        </div>

        <div className="mt-4 flex items-end justify-between">
          <div className="text-3xl font-bold text-white">
            <span>{result.temperature}° C</span>
            <span className="text-sm text-white/50">
              {" / "}
              {((result.temperature * 9) / 5 + 32).toFixed(1)}° F
            </span>
          </div>
          <div className="text-sm text-white capitalize">
            {result.conditions}
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-white">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div data-testid="weather-humidity">
              <p className="text-white text-xs">Humidity</p>
              <p className="text-white font-medium">{result.humidity}%</p>
            </div>
            <div data-testid="weather-wind">
              <p className="text-white text-xs">Wind</p>
              <p className="text-white font-medium">{result.windSpeed} mph</p>
            </div>
            <div data-testid="weather-feels-like">
              <p className="text-white text-xs">Feels Like</p>
              <p className="text-white font-medium">{result.feelsLike}°</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function WeatherIcon({ conditions }: { conditions: string }) {
  if (!conditions) return null;

  const value = conditions.toLowerCase();

  if (value.includes("clear") || value.includes("sunny")) {
    return <SunIcon />;
  }

  if (
    value.includes("rain") ||
    value.includes("drizzle") ||
    value.includes("snow") ||
    value.includes("thunderstorm")
  ) {
    return <RainIcon />;
  }

  if (
    value.includes("fog") ||
    value.includes("cloud") ||
    value.includes("overcast")
  ) {
    return <CloudIcon />;
  }

  return <CloudIcon />;
}

function SunIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="w-14 h-14 text-yellow-200"
    >
      <circle cx="12" cy="12" r="5" />
      <path
        d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
        strokeWidth="2"
        stroke="currentColor"
      />
    </svg>
  );
}

function RainIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="w-14 h-14 text-blue-200"
    >
      <path
        d="M7 15a4 4 0 0 1 0-8 5 5 0 0 1 10 0 4 4 0 0 1 0 8H7z"
        fill="currentColor"
        opacity="0.8"
      />
      <path
        d="M8 18l2 4M12 18l2 4M16 18l2 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

function CloudIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="w-14 h-14 text-gray-200"
    >
      <path
        d="M7 15a4 4 0 0 1 0-8 5 5 0 0 1 10 0 4 4 0 0 1 0 8H7z"
        fill="currentColor"
      />
    </svg>
  );
}