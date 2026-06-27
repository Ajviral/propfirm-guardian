//+------------------------------------------------------------------+
//| PropFirmGuardianEA.mq5                                           |
//| PropFirm Guardian — MT5 account sync Expert Advisor              |
//| Version 1.01                                                     |
//+------------------------------------------------------------------+
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
#property version   "1.01"

//--- Inputs
input string ServerURL = "https://propfirm-guardian-server.onrender.com";
input string AccountToken = "";
input int PushIntervalSecs = 5;
input bool EnableLogging = false;

//--- Globals
datetime lastPushTime = 0;

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
//| Build and POST account + position JSON to the backend.           |
//+------------------------------------------------------------------+
bool PushAccountData()
{
   if(StringLen(AccountToken) == 0)
   {
      LogMessage("AccountToken is empty — skipping push.");
      return false;
   }

   string accountName     = AccountInfoString(ACCOUNT_NAME);
   string accountServer   = AccountInfoString(ACCOUNT_SERVER);
   string accountCurrency = AccountInfoString(ACCOUNT_CURRENCY);
   long   accountNumber   = AccountInfoInteger(ACCOUNT_LOGIN);

   double balance  = AccountInfoDouble(ACCOUNT_BALANCE);
   double equity   = AccountInfoDouble(ACCOUNT_EQUITY);
   double margin   = AccountInfoDouble(ACCOUNT_MARGIN);
   double freeMargin = AccountInfoDouble(ACCOUNT_MARGIN_FREE);
   double profit   = AccountInfoDouble(ACCOUNT_PROFIT);

   // Timestamp for the backend payload uses GMT only (FIX 2).
   long timestampGmt = (long)TimeGMT();

   string json = "{";

   json += "\"token\":\""         + JsonEscape(AccountToken)     + "\",";
   json += "\"accountNumber\":"   + IntegerToString(accountNumber) + ",";
   json += "\"timestamp\":"        + IntegerToString(timestampGmt) + ",";
   json += "\"accountName\":\""   + JsonEscape(accountName)      + "\",";
   json += "\"accountServer\":\"" + JsonEscape(accountServer)    + "\",";
   json += "\"accountCurrency\":\"" + JsonEscape(accountCurrency) + "\",";
   json += "\"balance\":"          + DoubleToString(balance, 2)   + ",";
   json += "\"equity\":"           + DoubleToString(equity, 2)    + ",";
   json += "\"margin\":"           + DoubleToString(margin, 2)    + ",";
   json += "\"freeMargin\":"       + DoubleToString(freeMargin, 2)+ ",";
   json += "\"profit\":"           + DoubleToString(profit, 2)    + ",";
   json += "\"positions\":[";

   int total = PositionsTotal();
   bool firstPosition = true;

   for(int i = 0; i < total; i++)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0)
         continue;

      if(!PositionSelectByTicket(ticket))
         continue;

      string symbol   = PositionGetString(POSITION_SYMBOL);
      long   type     = PositionGetInteger(POSITION_TYPE);
      double volume   = PositionGetDouble(POSITION_VOLUME);
      double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
      double sl       = PositionGetDouble(POSITION_SL);
      double tp       = PositionGetDouble(POSITION_TP);
      double posProfit = PositionGetDouble(POSITION_PROFIT);
      datetime openTime = (datetime)PositionGetInteger(POSITION_TIME);

      int priceDigits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
      int volDigits   = VolumeDigits(symbol);

      if(!firstPosition)
         json += ",";
      firstPosition = false;

      json += "{";
      json += "\"ticket\":"     + IntegerToString(ticket)                          + ",";
      json += "\"symbol\":\""   + JsonEscape(symbol)                               + "\",";
      json += "\"type\":"       + IntegerToString(type)                            + ",";
      json += "\"volume\":"     + DoubleToString(volume, volDigits)                + ",";
      json += "\"openPrice\":"  + DoubleToString(openPrice, priceDigits)           + ",";
      json += "\"sl\":"         + DoubleToString(sl, priceDigits)                  + ",";
      json += "\"tp\":"         + DoubleToString(tp, priceDigits)                  + ",";
      json += "\"profit\":"     + DoubleToString(posProfit, 2)                     + ",";
      json += "\"openTime\":"   + IntegerToString((long)openTime);
      json += "}";
   }

   json += "]}";

   return SendToServer(json);
}

//+------------------------------------------------------------------+
//| POST JSON body to ServerURL via WebRequest().                     |
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
      ServerURL,
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
   // FIX 7 — reject invalid interval before anything else runs.
   if(PushIntervalSecs < 1)
   {
      Alert("PropFirmGuardianEA: PushIntervalSecs must be >= 1 second.");
      return INIT_PARAMETERS_INCORRECT;
   }

   if(StringLen(AccountToken) == 0)
      Alert("PropFirmGuardianEA: AccountToken is empty. Set it in EA inputs.");

   // FIX 1 — start periodic timer after validation.
   if(!EventSetTimer(PushIntervalSecs))
   {
      int err = GetLastError();
      LogMessage("EventSetTimer failed. Error: " + IntegerToString(err));
      return INIT_FAILED;
   }

   LogMessage("EA initialized. Push interval: " + IntegerToString(PushIntervalSecs) + "s");

   // Immediate startup push.
   PushAccountData();

   // FIX 1 — anchor scheduling clock to trade server time immediately.
   lastPushTime = TimeTradeServer();

   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
//| Expert deinitialization                                          |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   LogMessage("EA stopped. Reason: " + IntegerToString(reason));
}

//+------------------------------------------------------------------+
//| Timer handler — fires every PushIntervalSecs seconds.            |
//+------------------------------------------------------------------+
void OnTimer()
{
   datetime now = TimeTradeServer();

   if(now - lastPushTime >= PushIntervalSecs)
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

   if(now - lastPushTime >= PushIntervalSecs)
   {
      PushAccountData();
      lastPushTime = now;
   }
}

//+------------------------------------------------------------------+
