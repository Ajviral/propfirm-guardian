//+------------------------------------------------------------------+
//| PropFirmGuardianEA.mq5                                           |
//| PropFirm Guardian — MT5 account sync Expert Advisor              |
//| Version 1.03                                                     |
//+------------------------------------------------------------------+
//
// CHANGELOG v1.03
// ---------------
// FIX 1: No-SL local Alert fires exactly once per breach episode
//        (alertSent set before Alert; fixed message; reliable ticket
//        cleanup via IsTicketOpen).
// FIX 2: NoStopLossMinutes is an enum dropdown (1–5 minutes).
// FIX 3: Standalone empty-token log wording neutralized (no "server push").
//
// CHANGELOG v1.02
// ---------------
// NEW 1: Extended JSON data contract — account leverage, marginLevel,
//        noStopLossAlert; per-position hasStopLoss, currentPrice,
//        noStopLossBreached.
// NEW 2: No-stop-loss tracking per ticket with local Alert() on first
//        breach (works without AccountToken); server push remains token-gated.
// NEW 3: NoStopLossMinutes input (1–5, clamped in OnInit).
// CHG 1: ServerURL and PushIntervalSecs moved to internal constants
//        (not user-visible); visible inputs: AccountToken,
//        NoStopLossMinutes, EnableLogging.
//
// CHANGELOG v1.01
// ---------------
// FIX 1 (P1): EventSetTimer(PushIntervalSecs) in OnInit with failure
//             handling; lastPushTime set to TimeTradeServer() after
//             startup PushAccountData().
// FIX 2 (P1): TimeTradeServer() for all scheduling; TimeGMT() only for
//             the JSON payload timestamp sent to the backend.
// FIX 3 (P1): JsonEscape() helper applied to AccountToken, account name,
//             server, currency, and every position symbol string.
// FIX 4 (P2): SendToServer() uses char[] arrays with default StringToCharArray
//             encoding and WebRequest() Signature A (7 parameters).
// FIX 5 (P2): ticket (ulong) and openTime (datetime) serialized via
//             IntegerToString() without int casts.
// FIX 6 (P2): Price fields use SYMBOL_DIGITS; volume uses
//             SYMBOL_VOLUME_STEP for decimal precision.
// FIX 7 (P2): PushIntervalSecs < 1 returns INIT_PARAMETERS_INCORRECT.
// FIX 8 (P3): WebRequest() failures log GetLastError() and resultHeaders.
// FIX 9 (P3): MT5-only disclaimer; all MT4 compatibility references removed.
//
// PLATFORM NOTICE
// ---------------
// This Expert Advisor is written exclusively for MetaTrader 5 (MQL5).
// It will NOT compile, load, or run in MetaTrader 4. Do not attempt to
// rename or port this file to MT4.
//
//+------------------------------------------------------------------+
#property copyright "PropFirm Guardian"
#property link      "https://propfirmguardian.com"
#property version   "1.03"

//--- Internal constants (not shown on the EA inputs panel)
const string SERVER_URL          = "https://propfirm-guardian-server.onrender.com";
const int    PUSH_INTERVAL_SECS  = 5;

//--- No-stop-loss interval (dropdown: 1–5 minutes)
enum ENUM_NOSL_MINUTES
{
   NOSL_1MIN = 1,   // 1 minute
   NOSL_2MIN = 2,   // 2 minutes
   NOSL_3MIN = 3,   // 3 minutes
   NOSL_4MIN = 4,   // 4 minutes
   NOSL_5MIN = 5    // 5 minutes
};

//--- Inputs
input string            AccountToken      = "";
input ENUM_NOSL_MINUTES NoStopLossMinutes = NOSL_2MIN;  // No-stop-loss alert interval
input bool              EnableLogging     = false;

//--- No-stop-loss tracking (per open position ticket)
struct NoSlState
{
   ulong    ticket;
   datetime firstSeenWithoutSL;
   bool     alertSent;
};

//--- Globals
datetime   lastPushTime        = 0;
int        g_noStopLossMinutes = 2;
NoSlState  g_noSlStates[];

//+------------------------------------------------------------------+
//| Escape a string for safe inclusion in a JSON value.              |
//| Handles backslash, double-quote, forward-slash, and control chars.|
//+------------------------------------------------------------------+
string JsonEscape(const string value)
{
   string result = "";
   int len = StringLen(value);

   for(int i = 0; i < len; i++)
   {
      ushort ch = StringGetCharacter(value, i);

      switch(ch)
      {
         case '\\': result += "\\\\"; break;
         case '\"': result += "\\\""; break;
         case '/':  result += "\\/";  break;
         case '\n': result += "\\n";  break;
         case '\r': result += "\\r";  break;
         case '\t': result += "\\t";  break;
         case '\f': result += "\\f";  break;
         default:
            if(ch < 32)
               result += StringFormat("\\u%04X", ch);
            else
               result += ShortToString(ch);
            break;
      }
   }

   return result;
}

//+------------------------------------------------------------------+
//| JSON boolean literal.                                            |
//+------------------------------------------------------------------+
string JsonBool(const bool value)
{
   return value ? "true" : "false";
}

//+------------------------------------------------------------------+
//| Derive decimal places for volume from SYMBOL_VOLUME_STEP.        |
//+------------------------------------------------------------------+
int VolumeDigits(const string symbol)
{
   double step = SymbolInfoDouble(symbol, SYMBOL_VOLUME_STEP);
   if(step <= 0.0)
      return 2;

   int digits = 0;
   double scaled = step;

   while(scaled < 1.0 && digits < 8)
   {
      scaled *= 10.0;
      digits++;
   }

   return digits;
}

//+------------------------------------------------------------------+
//| Log helper — only prints when EnableLogging is true.             |
//+------------------------------------------------------------------+
void LogMessage(const string message)
{
   if(EnableLogging)
      Print("[PropFirmGuardianEA] ", message);
}

//+------------------------------------------------------------------+
//| Find index of a ticket in g_noSlStates, or -1.                   |
//+------------------------------------------------------------------+
int FindNoSlStateIndex(const ulong ticket)
{
   int n = ArraySize(g_noSlStates);
   for(int i = 0; i < n; i++)
   {
      if(g_noSlStates[i].ticket == ticket)
         return i;
   }
   return -1;
}

//+------------------------------------------------------------------+
//| Remove one tracking entry by array index.                        |
//+------------------------------------------------------------------+
void RemoveNoSlStateAt(const int index)
{
   int n = ArraySize(g_noSlStates);
   if(index < 0 || index >= n)
      return;

   for(int i = index; i < n - 1; i++)
      g_noSlStates[i] = g_noSlStates[i + 1];

   ArrayResize(g_noSlStates, n - 1);
}

//+------------------------------------------------------------------+
//| True if ticket still appears in the open positions list.         |
//+------------------------------------------------------------------+
bool IsTicketOpen(const ulong ticket)
{
   int total = PositionsTotal();
   for(int i = 0; i < total; i++)
   {
      if(PositionGetTicket(i) == ticket)
         return true;
   }
   return false;
}

//+------------------------------------------------------------------+
//| Drop tracking rows for positions that are no longer open.         |
//+------------------------------------------------------------------+
void CleanupNoSlStates()
{
   for(int i = ArraySize(g_noSlStates) - 1; i >= 0; i--)
   {
      if(!IsTicketOpen(g_noSlStates[i].ticket))
         RemoveNoSlStateAt(i);
   }
}

//+------------------------------------------------------------------+
//| Evaluate no-SL timer for one position; fire local Alert on breach.|
//+------------------------------------------------------------------+
void EvaluateNoStopLoss(
   const ulong ticket,
   const double sl,
   const string symbol,
   bool &hasStopLoss,
   bool &noStopLossBreached
)
{
   hasStopLoss = (sl != 0.0);
   noStopLossBreached = false;

   if(hasStopLoss)
   {
      int idx = FindNoSlStateIndex(ticket);
      if(idx >= 0)
         RemoveNoSlStateAt(idx);
      return;
   }

   datetime now = TimeTradeServer();
   int idx = FindNoSlStateIndex(ticket);

   if(idx < 0)
   {
      int n = ArraySize(g_noSlStates);
      ArrayResize(g_noSlStates, n + 1);
      g_noSlStates[n].ticket = ticket;
      g_noSlStates[n].firstSeenWithoutSL = now;
      g_noSlStates[n].alertSent = false;
      idx = n;
   }

   int elapsedSec = (int)(now - g_noSlStates[idx].firstSeenWithoutSL);
   int thresholdSec = g_noStopLossMinutes * 60;

   if(elapsedSec >= thresholdSec)
   {
      noStopLossBreached = true;

      if(!g_noSlStates[idx].alertSent)
      {
         g_noSlStates[idx].alertSent = true;
         Alert("PropFirm Guardian: ", symbol, " has NO stop loss");
      }
   }
}

//+------------------------------------------------------------------+
//| Build and POST account + position JSON to the backend.           |
//| No-stop-loss evaluation + local Alert always run; server push     |
//| only when AccountToken is non-empty.                             |
//+------------------------------------------------------------------+
bool PushAccountData()
{
   CleanupNoSlStates();

   bool accountNoStopLossAlert = false;
   string positionsJson = "[";
   bool firstPosition = true;

   int total = PositionsTotal();

   for(int i = 0; i < total; i++)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0)
         continue;

      if(!PositionSelectByTicket(ticket))
         continue;

      string symbol    = PositionGetString(POSITION_SYMBOL);
      long   type      = PositionGetInteger(POSITION_TYPE);
      double volume    = PositionGetDouble(POSITION_VOLUME);
      double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
      double sl        = PositionGetDouble(POSITION_SL);
      double tp        = PositionGetDouble(POSITION_TP);
      double posProfit = PositionGetDouble(POSITION_PROFIT);
      datetime openTime = (datetime)PositionGetInteger(POSITION_TIME);

      bool hasStopLoss = false;
      bool noStopLossBreached = false;
      EvaluateNoStopLoss(ticket, sl, symbol, hasStopLoss, noStopLossBreached);

      if(noStopLossBreached)
         accountNoStopLossAlert = true;

      int priceDigits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
      int volDigits   = VolumeDigits(symbol);

      double currentPrice = 0.0;
      if(type == POSITION_TYPE_BUY)
         currentPrice = SymbolInfoDouble(symbol, SYMBOL_BID);
      else if(type == POSITION_TYPE_SELL)
         currentPrice = SymbolInfoDouble(symbol, SYMBOL_ASK);
      else
         currentPrice = SymbolInfoDouble(symbol, SYMBOL_BID);

      if(!firstPosition)
         positionsJson += ",";
      firstPosition = false;

      positionsJson += "{";
      positionsJson += "\"ticket\":"            + IntegerToString(ticket)                + ",";
      positionsJson += "\"symbol\":\""          + JsonEscape(symbol)                     + "\",";
      positionsJson += "\"type\":"              + IntegerToString(type)                  + ",";
      positionsJson += "\"volume\":"            + DoubleToString(volume, volDigits)      + ",";
      positionsJson += "\"openPrice\":"         + DoubleToString(openPrice, priceDigits) + ",";
      positionsJson += "\"sl\":"                + DoubleToString(sl, priceDigits)        + ",";
      positionsJson += "\"tp\":"                + DoubleToString(tp, priceDigits)        + ",";
      positionsJson += "\"profit\":"            + DoubleToString(posProfit, 2)           + ",";
      positionsJson += "\"openTime\":"          + IntegerToString((long)openTime)        + ",";
      positionsJson += "\"hasStopLoss\":"       + JsonBool(hasStopLoss)                  + ",";
      positionsJson += "\"currentPrice\":"      + DoubleToString(currentPrice, priceDigits) + ",";
      positionsJson += "\"noStopLossBreached\":" + JsonBool(noStopLossBreached);
      positionsJson += "}";
   }

   positionsJson += "]";

   if(StringLen(AccountToken) == 0)
   {
      LogMessage("Standalone mode — no-stop-loss monitoring active.");
      return false;
   }

   string accountName     = AccountInfoString(ACCOUNT_NAME);
   string accountServer   = AccountInfoString(ACCOUNT_SERVER);
   string accountCurrency = AccountInfoString(ACCOUNT_CURRENCY);
   long   accountNumber   = AccountInfoInteger(ACCOUNT_LOGIN);
   long   leverage        = AccountInfoInteger(ACCOUNT_LEVERAGE);

   double balance    = AccountInfoDouble(ACCOUNT_BALANCE);
   double equity     = AccountInfoDouble(ACCOUNT_EQUITY);
   double margin     = AccountInfoDouble(ACCOUNT_MARGIN);
   double freeMargin = AccountInfoDouble(ACCOUNT_MARGIN_FREE);
   double profit     = AccountInfoDouble(ACCOUNT_PROFIT);
   double marginLevel = AccountInfoDouble(ACCOUNT_MARGIN_LEVEL);

   long timestampGmt = (long)TimeGMT();

   string json = "{";

   json += "\"token\":\""           + JsonEscape(AccountToken)       + "\",";
   json += "\"accountNumber\":"     + IntegerToString(accountNumber) + ",";
   json += "\"timestamp\":"          + IntegerToString(timestampGmt)  + ",";
   json += "\"accountName\":\""     + JsonEscape(accountName)        + "\",";
   json += "\"accountServer\":\""   + JsonEscape(accountServer)      + "\",";
   json += "\"accountCurrency\":\"" + JsonEscape(accountCurrency)    + "\",";
   json += "\"balance\":"            + DoubleToString(balance, 2)     + ",";
   json += "\"equity\":"             + DoubleToString(equity, 2)      + ",";
   json += "\"margin\":"             + DoubleToString(margin, 2)      + ",";
   json += "\"freeMargin\":"         + DoubleToString(freeMargin, 2)  + ",";
   json += "\"profit\":"             + DoubleToString(profit, 2)      + ",";
   json += "\"leverage\":"           + IntegerToString(leverage)      + ",";
   json += "\"marginLevel\":"        + DoubleToString(marginLevel, 2) + ",";
   json += "\"noStopLossAlert\":"    + JsonBool(accountNoStopLossAlert) + ",";
   json += "\"positions\":"          + positionsJson;
   json += "}";

   return SendToServer(json);
}

//+------------------------------------------------------------------+
//| POST JSON body to SERVER_URL via WebRequest().                   |
//+------------------------------------------------------------------+
bool SendToServer(const string jsonBody)
{
   string headers = "Content-Type: application/json\r\nAccept: application/json\r\n";

   char postData[];
   char resultData[];
   string resultHeaders = "";

   int dataLen = StringToCharArray(jsonBody, postData) - 1;
   if(dataLen <= 0)
   {
      Print("Failed to encode payload");
      return false;
   }
   ArrayResize(postData, dataLen);

   Print("Sending payload length: ", ArraySize(postData), " First 100 chars: ", StringSubstr(jsonBody, 0, 100));

   ResetLastError();
   int status = WebRequest(
      "POST",
      SERVER_URL,
      headers,
      10000,
      postData,
      resultData,
      resultHeaders
   );

   if(status == -1)
   {
      int err = GetLastError();
      LogMessage(
         "WebRequest failed. Error: " + IntegerToString(err) +
         " | Response headers: " + resultHeaders +
         " | Hint: add URL to Tools > Options > Expert Advisors > Allow WebRequest."
      );
      return false;
   }

   if(status < 200 || status >= 300)
   {
      string responseBody = CharArrayToString(resultData);
      LogMessage(
         "Server returned HTTP " + IntegerToString(status) +
         " | Headers: " + resultHeaders +
         " | Body: " + responseBody
      );
      return false;
   }

   LogMessage("Push successful (HTTP " + IntegerToString(status) + ").");
   return true;
}

//+------------------------------------------------------------------+
//| Expert initialization                                            |
//+------------------------------------------------------------------+
int OnInit()
{
   g_noStopLossMinutes = (int)NoStopLossMinutes;

   if(StringLen(AccountToken) == 0)
      LogMessage("Standalone mode — no-stop-loss monitoring active.");

   if(!EventSetTimer(PUSH_INTERVAL_SECS))
   {
      int err = GetLastError();
      LogMessage("EventSetTimer failed. Error: " + IntegerToString(err));
      return INIT_FAILED;
   }

   LogMessage(
      "EA initialized. Push interval: " + IntegerToString(PUSH_INTERVAL_SECS) +
      "s | No-SL interval: " + IntegerToString(g_noStopLossMinutes) + " min"
   );

   PushAccountData();

   lastPushTime = TimeTradeServer();

   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
//| Expert deinitialization                                          |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   ArrayResize(g_noSlStates, 0);
   LogMessage("EA stopped. Reason: " + IntegerToString(reason));
}

//+------------------------------------------------------------------+
//| Timer handler — fires every PUSH_INTERVAL_SECS seconds.          |
//+------------------------------------------------------------------+
void OnTimer()
{
   datetime now = TimeTradeServer();

   if(now - lastPushTime >= PUSH_INTERVAL_SECS)
   {
      PushAccountData();
      lastPushTime = now;
   }
}

//+------------------------------------------------------------------+
//| Tick handler — backup scheduling guard using trade server time.  |
//+------------------------------------------------------------------+
void OnTick()
{
   datetime now = TimeTradeServer();

   if(now - lastPushTime >= PUSH_INTERVAL_SECS)
   {
      PushAccountData();
      lastPushTime = now;
   }
}

//+------------------------------------------------------------------+
