/**
 * Alert callback function called when an endpoint becomes unhealthy.
 */
export type AlertCallback = (alert: EndpointAlert) => void | Promise<void>;

/**
 * Alert information when an endpoint becomes unhealthy.
 */
export interface EndpointAlert {
  /** Endpoint ID */
  endpointId: string;
  /** Endpoint URL */
  url: string;
  /** Route ID (if from gateway) */
  routeId?: string;
  /** Number of consecutive failures */
  consecutiveFailures: number;
  /** Last error message */
  lastError?: string;
  /** Timestamp when alert was triggered */
  timestamp: number;
}

/**
 * Telegram alert configuration.
 */
export interface TelegramAlertConfig {
  /** Telegram bot token */
  botToken: string;
  /** Telegram chat ID to send alerts to */
  chatId: string;
  /** Optional: custom message format function */
  formatMessage?: (alert: EndpointAlert) => string;
}

/**
 * Create a Telegram alert callback function.
 */
export function createTelegramAlert(
  config: TelegramAlertConfig,
): AlertCallback {
  const { botToken, chatId, formatMessage } = config;

  return async (alert: EndpointAlert): Promise<void> => {
    console.log("\n📢 [Telegram Alert] Triggering alert for endpoint:", alert.url);
    
    const message = formatMessage
      ? formatMessage(alert)
      : formatDefaultMessage(alert);

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const body = {
      chat_id: chatId,
      text: message,
      parse_mode: "HTML",
    };

    try {
      console.log(`📤 [Telegram Alert] Sending to chat ${chatId}...`);
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error(`❌ [Telegram Alert] Failed to send: ${error}`);
        console.error(`   Status: ${response.status}`);
        console.error(`   URL: ${url}`);
        console.error(`   Chat ID: ${chatId}`);
      } else {
        const result = await response.json();
        if (result.ok) {
          console.log(`✅ [Telegram Alert] Successfully sent to Telegram!`);
        } else {
          console.error(`❌ [Telegram Alert] Telegram API error:`, result);
        }
      }
    } catch (error) {
      console.error("❌ [Telegram Alert] Error sending alert:", error);
      if (error instanceof Error) {
        console.error(`   Message: ${error.message}`);
      }
    }
  };
}

function formatDefaultMessage(alert: EndpointAlert): string {
  const routeInfo = alert.routeId ? `\nRoute: <b>${alert.routeId}</b>` : "";
  const errorInfo = alert.lastError
    ? `\nError: <code>${escapeHtml(alert.lastError)}</code>`
    : "";

  return (
    `🚨 <b>RPC Endpoint Unhealthy</b>\n\n` +
    `Endpoint: <code>${escapeHtml(alert.url)}</code>\n` +
    `ID: <code>${alert.endpointId}</code>${routeInfo}\n` +
    `Failures: <b>${alert.consecutiveFailures}</b>${errorInfo}\n` +
    `Time: <code>${new Date(alert.timestamp).toISOString()}</code>`
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

