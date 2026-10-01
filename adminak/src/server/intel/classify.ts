import type { Category } from "../../shared/types.js";
import { CATEGORIES } from "../../shared/types.js";
import type { Classification, VendorMatch } from "./types.js";
import { ADDRESS_PRIORS, KIND_CATEGORY, type VendorKind } from "./vendors.js";
import { domainOf, isConsumerDomain } from "./vendor-resolve.js";

interface Signal {
  cat: Category;
  sub?: string;
  w: number;
  re: RegExp;
  reason: string;
  subjectOnly?: boolean;
}

// Each signal adds weight to a category (and optionally a subtype). Subject matches count 1.6×.
const SIGNALS: Signal[] = [
  // ── Subscriptions ─────────────────────────────────────────────────────────
  {
    cat: "subscriptions",
    sub: "payment_failed",
    w: 6,
    reason: "payment failure language",
    re: /\b(payment (failed|declined|was declined|was unsuccessful|unsuccessful|didn'?t go through|could ?n[o']t be processed|issue|problem)|(card|payment method) (was |has been )?declined|unable to (process|charge|collect|renew)|we (couldn'?t|could not|were unable to) (process|charge|collect|renew|bill)|update (your )?(payment|billing) (method|details|info(rmation)?)|failed to renew|(subscription|membership|account) (is |has been )?(on hold|paused|suspended) (due to|because)|retry(ing)? (the |your )?payment)\b/i,
  },
  {
    cat: "subscriptions",
    sub: "price_change",
    w: 6,
    reason: "price change notice",
    re: /\b(price (change|increase|update|adjustment)s?|(prices?|pricing|rates?) (is|are|will be) (changing|increasing|going up)|(update|change|increase)s? to your (plan|subscription|membership)('s)? (price|pricing)|new (monthly |annual |yearly )?(price|pricing|rate)\b|we('re| are) (raising|increasing|updating|adjusting) (our |the |your )?(prices?|pricing|rates?)|(monthly|annual|yearly|subscription|membership|plan) (price|fee|cost|rate) will (increase|change|go up|be)|pricing update)/i,
  },
  {
    cat: "subscriptions",
    sub: "trial_ending",
    w: 6,
    reason: "trial ending notice",
    re: /\b((free )?trial (ends|will end|is ending|expires|ending|is about to end|period ends|period is ending|ends soon|expiring|will expire|is over|converts|end(s)? (on|in|tomorrow|today))|(days?|hours?) left (in|on) your (free )?trial|before (your|the) (free )?trial ends|trial (end|expiration) (date|reminder)|your trial is almost over|after (your|the) (free )?trial,? you('ll| will) be (charged|billed))/i,
  },
  {
    cat: "subscriptions",
    sub: "trial_started",
    w: 4.5,
    reason: "trial started",
    re: /\b((your )?(free )?trial (has )?(started|begun|is (now )?active|starts now|activated)|welcome to your (free )?trial|you('ve| have) started (a|your) (free )?trial|enjoy your (free )?trial|trial (confirmation|activated))/i,
  },
  {
    cat: "subscriptions",
    sub: "cancelled",
    w: 5.5,
    reason: "cancellation confirmation",
    re: /\b((subscription|membership|plan|auto-?renew(al)?) (has been |was |is |is now )?(cancel+ed|terminated|ended|turned off|deactivated)|we('ve| have) cancel+ed|you('ve| have) cancel+ed|cancel+ation (confirmation|confirmed|request (received|processed))|confirm(ing)? your cancel+ation|sorry to see you go|will not (auto-?)?renew)/i,
  },
  {
    cat: "subscriptions",
    sub: "renewal_notice",
    w: 4.5,
    reason: "renewal notice",
    re: /\b(will (auto(matically)?[- ]?)?renew|renew(s|al)? (on|soon|date|reminder|notice|notification)|upcoming (renewal|payment|charge|billing|subscription payment)|(subscription|membership|plan|domain|license|policy) (is )?(up for |about to |due for )?renew(al|s|ing)|auto-?renew(al)? (is )?(on|enabled|scheduled)|your next (billing|payment|charge|bill) (date|is|will)|will be (charged|billed)( automatically)? on|scheduled to renew|renewing soon|is set to renew)/i,
  },
  {
    cat: "subscriptions",
    sub: "receipt",
    w: 4,
    reason: "receipt or payment confirmation",
    re: /\b(receipt|invoice (paid|#|no\.?)|payment (received|confirmation|successful|processed|complete)|thanks? (you )?for your (payment|purchase|subscription|renewal)|(your|the) (payment|charge) of|you('ve| have) been (charged|billed)|(subscription|membership) (payment|charge|renewed|renewal (confirmation|receipt|successful))|successfully (renewed|charged|billed|paid)|amount (paid|charged)|billing (receipt|summary)|your (monthly|annual|yearly) (bill|invoice|payment))/i,
  },
  {
    cat: "subscriptions",
    sub: "started",
    w: 4,
    reason: "new subscription confirmation",
    re: /\b(welcome to [\w+ ]{2,30}(premium|plus|pro|subscription|membership|max|unlimited|one)|thanks? (you )?for (subscribing|joining|upgrading|becoming a (member|subscriber))|your (subscription|membership|plan) (is|has been) (confirmed|activated|active|started|upgraded)|subscription (confirmed|confirmation|activated|started)|you('re| are) (now )?(subscribed|a (premium|plus|pro|paid) (member|subscriber))|upgrade (confirmed|successful|complete)|you('ve| have) (upgraded|subscribed) to)/i,
  },
  {
    cat: "subscriptions",
    sub: "plan_changed",
    w: 4,
    reason: "plan change",
    re: /\b(plan (change|changed|updated|has been changed|downgrade[d]?|upgrade[d]?)|(changed|switched|moved) (your|to) (the )?[\w+ ]{0,25} plan|(upgrade|downgrade) (confirmed|confirmation|complete))/i,
  },
  {
    cat: "subscriptions",
    w: 1.5,
    reason: "subscription vocabulary",
    re: /\b(subscription|membership|recurring (charge|payment|billing)|auto-?renew(al)?|billing (cycle|period)|\/mo\b|per month|monthly plan|annual plan|yearly plan|cancel (anytime|your subscription))\b/i,
  },

  // ── Bills ─────────────────────────────────────────────────────────────────
  {
    cat: "bills",
    sub: "overdue",
    w: 6,
    reason: "overdue notice",
    re: /\b(past due|overdue|late (fee|payment|charge)|missed (your |a )?payment|payment (is )?late|delinquent|final notice|disconnection notice|service (interruption|suspension) notice)\b/i,
  },
  {
    cat: "bills",
    sub: "due_reminder",
    w: 5,
    reason: "payment due reminder",
    re: /\b((payment|bill|amount|balance|minimum payment|premium) (is )?due( (on|by|soon|in \d+ days|tomorrow|today))?|due date (is )?(approaching|coming up|reminder)|pay (your bill|by)|payment reminder|bill(ing)? reminder|upcoming (bill|payment due)|don'?t forget to pay|time to pay|make (a|your) payment by)\b/i,
  },
  {
    cat: "bills",
    sub: "statement",
    w: 4.5,
    reason: "statement available",
    re: /\b((e-?)?statement (is )?(ready|available|now available|has been posted)|your (monthly |new |latest |[a-z]+ \d{4} )?(bill|statement|e-?bill) (is ready|is available|is now available|has arrived|is here|for)|new (bill|statement|e-?bill) (is )?(available|ready|posted)|view your (bill|statement)|statement balance|billing statement|your bill is ready)\b/i,
  },
  {
    cat: "bills",
    sub: "payment_confirmation",
    w: 4.5,
    reason: "bill payment confirmation",
    re: /\b(payment (received|posted|confirmation|processed|was successful|successful|has been (received|processed|posted|applied))|thank(s| you) for (your|the|making a) (bill |card )?payment|we('ve| have) received your payment|your payment (of [^\n]{1,20} )?(has been|was) (received|processed|posted|applied)|payment confirmed|auto-?pay (payment )?(processed|completed|was successful))\b/i,
  },
  {
    cat: "bills",
    sub: "autopay_scheduled",
    w: 4,
    reason: "autopay scheduled",
    re: /\b(auto-?pay (is )?(scheduled|set up|enabled|on|payment (is )?scheduled)|automatic payment (is )?(scheduled|will be (made|processed))|will be (automatically )?(deducted|debited|withdrawn|drafted)|scheduled payment|payment (is )?scheduled)\b/i,
  },
  {
    cat: "bills",
    w: 1.5,
    reason: "billing vocabulary",
    re: /\b(account (ending|number)|amount due|minimum (payment|due)|due date|utility|electric(ity)?|natural gas|water bill|wireless|internet service|insurance premium|policy (number|renewal)|rent|mortgage|loan payment|credit card|card ending|statement)\b/i,
  },

  // ── Finance ───────────────────────────────────────────────────────────────
  {
    cat: "finance",
    sub: "fraud_alert",
    w: 7,
    reason: "fraud alert",
    re: /\b(fraud(ulent)?|unusual (activity|transaction|charge|purchase)|suspicious (transaction|charge|purchase)|did you (make|authorize|attempt) (this|a|these) (purchase|transaction|charge)s?|confirm (this|recent|a) (transaction|purchase)|(card|account) (has been |is )?(locked|frozen|blocked|restricted) (for|due)|verify (a |this |your )?(recent )?(transaction|purchase))\b/i,
  },
  {
    cat: "finance",
    sub: "transaction",
    w: 4.5,
    reason: "card transaction alert",
    re: /\b(transaction (alert|notification)|(purchase|charge|transaction|debit) (of|for|alert)\s*[$€£₹]|you (made|spent) (a )?(purchase|\$|€|£|₹)|was (charged|used|made) (on|at|with|to) your|your card (ending|was used)|(debit|credit) card (purchase|transaction|charge)|large (purchase|transaction)|(new|recent) (purchase|transaction|charge) (on|alert|of)|we noticed a (purchase|charge|transaction)|international transaction|online (purchase|transaction) (of|alert)|card(-| )not(-| )present)\b/i,
  },
  {
    cat: "finance",
    sub: "deposit",
    w: 5,
    reason: "deposit or payroll",
    re: /\b(direct deposit|deposit (received|posted|is available|has been made|notification)|(paycheck|payroll|salary|wages?) (has been )?(deposited|is ready|deposit|processed|available)|your pay (statement|stub|is ready)|(funds|money) (has been |have been )?deposited|you('ve| have) been paid|earnings statement|pay ?stub|payday)\b/i,
  },
  {
    cat: "finance",
    sub: "transfer_in",
    w: 5,
    reason: "money received",
    re: /\b(you('ve| have)? (received|got) (money|a payment|a transfer|\$|€|£|₹)|sent you (money|\$|€|£|₹|a payment)|money (received|is on its way to you|has arrived)|paid you|received a payment|incoming (transfer|wire|payment)|has sent you|you got paid)\b/i,
  },
  {
    cat: "finance",
    sub: "transfer_out",
    w: 4,
    reason: "money sent",
    re: /\b(you sent (money|\$|€|£|₹|a payment)|money sent|transfer (to|sent|initiated|completed|scheduled|confirmation)|wire (transfer )?(sent|initiated|confirmation)|(payment|money) (is )?on (its|the) way to)\b/i,
  },
  {
    cat: "finance",
    sub: "low_balance",
    w: 6,
    reason: "low balance warning",
    re: /\b(low (account )?balance|balance (is )?(below|under|low)|insufficient funds|overdraft|available balance (is|has) (dropped|fallen|below))\b/i,
  },
  {
    cat: "finance",
    sub: "investment",
    w: 4,
    reason: "investment activity",
    re: /\b(trade (confirmation|confirmed|executed)|order (executed|filled)|(dividend|interest) (paid|payment|earned|credited|received)|(brokerage|investment|retirement|portfolio) (statement|account (statement|update|summary)|summary)|(buy|sell|limit|market) order|recurring investment|contribution (received|processed|confirmation)|401\(?k\)?|roth ira|rollover|portfolio (update|summary|performance))\b/i,
  },
  {
    cat: "finance",
    sub: "tax_document",
    w: 6,
    reason: "tax document",
    re: /\b(tax (document|form|return|statement|refund|filing)s?|form (1099|w-?2|1098|1095|w-?9|1040)|1099-?(int|div|b|misc|nec|k|r|g)?\b|w-?2 (is )?(available|ready)|(irs|state|federal) (refund|notice|return)|e-?file|your (federal|state) (tax )?return|tax (season|year) \d{4})/i,
  },
  {
    cat: "finance",
    sub: "credit_score",
    w: 4.5,
    reason: "credit report change",
    re: /\b(credit (score|report) (update|change|alert|changed|increased|decreased|dropped)|your (fico|vantagescore|credit score)|score (went|has gone) (up|down)|credit monitoring alert|new (inquiry|account|hard inquiry) (on|in|reported to) your credit)\b/i,
  },
  {
    cat: "finance",
    sub: "refund",
    w: 4.5,
    reason: "refund issued",
    re: /\b(refund (issued|processed|initiated|completed|confirmation|of|has been|is on (its|the) way|approved)|(we('ve| have)|has been|was) refunded|your refund|(credit|reimbursement) (has been )?(issued|applied|posted|processed)|money back)\b/i,
  },
  {
    cat: "finance",
    w: 1.2,
    reason: "banking vocabulary",
    re: /\b(account (ending|summary|alert)|available balance|transaction|deposit|withdrawal|transfer|bank|checking|savings|brokerage|portfolio|routing|ach|wire)\b/i,
  },

  // ── Orders ────────────────────────────────────────────────────────────────
  {
    cat: "orders",
    sub: "delivered",
    w: 6,
    reason: "delivered notice",
    re: /\b((has been |was |been )delivered|delivered[:!]|your (package|order|shipment|item)s? (has |have )?(arrived|been delivered|was delivered)|delivery (complete|confirmation|confirmed)|left (at|in) (the |your )?(front door|porch|mailroom|mailbox|reception|parcel locker)|handed (directly )?to (resident|you|recipient))\b/i,
  },
  {
    cat: "orders",
    sub: "out_for_delivery",
    w: 6,
    reason: "out for delivery",
    re: /\b(out for delivery|arriving today|will (be delivered|arrive) today|delivery (is )?(today|expected today)|on (its|the) way (today|to you today)|driver is (nearby|on the way|approaching))\b/i,
  },
  {
    cat: "orders",
    sub: "delayed",
    w: 5.5,
    reason: "delivery problem",
    re: /\b((delivery|shipment|package|order) (is )?(delayed|exception|attempt(ed)?|failed|missed|held|on hold)|delivery (delay|exception|attempt)|running late|unable to deliver|could not be delivered|rescheduled delivery|new (estimated )?delivery date)\b/i,
  },
  {
    cat: "orders",
    sub: "shipped",
    w: 5,
    reason: "shipping update",
    re: /\b((has |have |was |been )?(shipped|dispatched)|on (its|the) way|in transit|shipment (confirmation|notification|update)|shipping (confirmation|notification|update)|tracking (number|info(rmation)?|details|#)|track (your )?(package|order|shipment)|label created|picked up by|handed (over )?to (the )?carrier|is headed your way)\b/i,
  },
  {
    cat: "orders",
    sub: "return",
    w: 5,
    reason: "return update",
    re: /\b(return (label|request|started|received|processed|approved|initiated|confirmation|authorization)|(your |the )?return (is|has been) (received|processed|approved)|drop[- ]off (your )?(return|package)|refund for your return)\b/i,
  },
  {
    cat: "orders",
    sub: "order_placed",
    w: 4.5,
    reason: "order confirmation",
    re: /\b(order (confirmation|confirmed|received|placed|summary)|thank(s| you) for (your )?(order|purchase|shopping)|we('ve| have) received your order|your order (of|from|is confirmed|has been (placed|received)|#)|purchase (confirmation|confirmed)|order number)\b/i,
  },
  {
    cat: "orders",
    w: 1.3,
    reason: "order vocabulary",
    re: /\b(order|package|shipment|delivery|tracking|carrier|qty|quantity|ship(ping)? (to|address)|estimated (delivery|arrival))\b/i,
  },

  // ── Security ──────────────────────────────────────────────────────────────
  {
    cat: "security",
    sub: "suspicious_activity",
    w: 7,
    reason: "suspicious activity warning",
    re: /\b(suspicious (activity|sign-?in|log-?in|attempt)|unusual (sign-?in|log-?in|activity)|unrecognized (device|sign-?in|log-?in|activity)|someone (tried|may have|has|might have) (to )?(sign|log|access|use|accessed)|blocked (a |an )?(suspicious )?(sign-?in|log-?in|attempt)|critical security alert|compromised|unauthori[sz]ed (access|log-?in|sign-?in|activity))\b/i,
  },
  {
    cat: "security",
    sub: "breach_notice",
    w: 7,
    reason: "data breach notice",
    re: /\b((data|security) (breach|incident)|your (data|information|password|email|personal information) (was|may have been|has been|were) (exposed|compromised|leaked|involved|accessed)|have i been pwned|found (in|on) the dark web|exposed in a (data )?breach|breach notification)\b/i,
  },
  {
    cat: "security",
    sub: "new_signin",
    w: 5.5,
    reason: "new sign-in alert",
    re: /\b(new (sign-?in|log-?in|device|browser|location)( detected)?|signed in (to|on|from|with)|(sign-?in|log-?in) (from|on|to) (a )?(new|another|your)|logged in (from|on|to)|security alert for|(sign-?in|log-?in) (alert|notification|detected|attempt)|access(ed)? (from|on|by) a new|was this you\??|new app (connected|access)|(granted|gave) access to your)\b/i,
  },
  {
    cat: "security",
    sub: "password_changed",
    w: 6,
    reason: "password changed",
    re: /\b(password (was |has been |successfully )?(changed|updated)( successfully)?|your password (was|has been) (changed|reset|updated)|you('ve| have)? (changed|updated) your password|password reset (was )?successful)\b/i,
  },
  {
    cat: "security",
    sub: "password_reset",
    w: 5,
    reason: "password reset request",
    re: /\b((reset|change) your password|password reset (request|link|instructions|code)|forgot (your )?password|recover(y)? (your )?account|request(ed)? to reset)\b/i,
  },
  {
    cat: "security",
    sub: "verification_code",
    w: 5,
    reason: "one-time code",
    re: /\b(verification code|security code|one[- ]time (pass(word|code)|code|pin)|\botp\b|2fa code|login code|sign-?in code|confirmation code is|your code is|authentication code|passcode|code to (sign|log) in|magic link|sign-?in link|log-?in link)\b/i,
  },
  {
    cat: "security",
    sub: "mfa_change",
    w: 5.5,
    reason: "two-factor change",
    re: /\b((two|2)[- ](factor|step) (authentication|verification) (was |has been |is now )?(enabled|disabled|turned (on|off)|changed|updated|removed|added)|(2fa|mfa) (enabled|disabled|turned|changed|removed)|(new |added (a )?)?(security key|passkey|authenticator app|recovery (email|phone|code)s?|backup codes?) (was |were |has been |have been )?(added|removed|changed|updated|generated|created))\b/i,
  },
  {
    cat: "security",
    sub: "account_locked",
    w: 6,
    reason: "account locked",
    re: /\b(account (has been |was |is |is temporarily )?(locked|suspended|disabled|restricted|frozen|deactivated)|temporarily (locked|suspended|restricted)|too many (failed )?(sign-?in|log-?in|password) attempts)\b/i,
  },
  {
    cat: "security",
    sub: "email_changed",
    w: 5,
    reason: "contact details changed",
    re: /\b((email|e-mail|phone|recovery) (address|number)? ?(was |has been )(changed|updated|added|removed)|(changed|updated) (the|your) (email|phone|recovery))\b/i,
  },
  {
    cat: "security",
    w: 1.2,
    reason: "security vocabulary",
    re: /\b(security|sign-?in|log-?in|password|device|authentication|2fa|mfa|account access|secure your account)\b/i,
  },

  // ── Travel ────────────────────────────────────────────────────────────────
  {
    cat: "travel",
    sub: "flight_change",
    w: 6.5,
    reason: "flight change",
    re: /\b(flight (delay|delayed|cancel+ed|cancel+ation|change|status update|has been (delayed|cancel+ed|changed|rescheduled))|gate change|schedule change|(your )?flight (has been|was|is) (delayed|cancel+ed|rescheduled|changed|retimed)|new departure time|rebook(ed|ing)?|missed connection)\b/i,
  },
  {
    cat: "travel",
    sub: "checkin",
    w: 5.5,
    reason: "check-in reminder",
    re: /\b((it'?s )?(time|ready) to check[- ]in|check[- ]in (now|is (now )?open|for your (upcoming )?flight|opens|online)|online check-?in|boarding pass|mobile boarding)\b/i,
  },
  {
    cat: "travel",
    sub: "flight",
    w: 5,
    reason: "flight booking",
    re: /\b(flight (confirmation|itinerary|reservation|receipt|booking|details|purchase)|(your |the )?trip (confirmation|to [A-Z]|itinerary|receipt|is confirmed)|e-?ticket( receipt| number)?|itinerary (receipt|confirmation|for)|record locator|seat (assignment|selection)|baggage allowance|departing flight|return flight)\b/i,
  },
  {
    cat: "travel",
    sub: "hotel",
    w: 5,
    reason: "lodging reservation",
    re: /\b(hotel (reservation|confirmation|booking)|(your )?(reservation|booking|stay) (is )?(confirmed|confirmation)|your (upcoming )?stay (at|in)|check-?in (date|time|:)|room (type|details|reservation)|\d+ nights?\b|host (has )?(confirmed|accepted))\b/i,
  },
  {
    cat: "travel",
    sub: "car_rental",
    w: 5,
    reason: "car rental",
    re: /\b(car rental|rental car|vehicle (reservation|rental)|rental (confirmation|agreement|reservation)|pick-?up (location|date|time)|return (location|date))\b/i,
  },
  {
    cat: "travel",
    sub: "ride",
    w: 5,
    reason: "ride receipt",
    re: /\b((your|thanks for (your|riding)) (trip|ride) (with|on|receipt)|trip receipt|ride receipt|thanks for riding|your (morning|afternoon|evening|night|weekend) (trip|ride)|trip (with|on) (uber|lyft))\b/i,
  },
  {
    cat: "travel",
    sub: "train",
    w: 5,
    reason: "rail booking",
    re: /\b(train (ticket|reservation|booking)|e-?ticket for your (train|journey)|rail (ticket|pass))\b/i,
  },
  {
    cat: "travel",
    w: 1.4,
    reason: "travel vocabulary",
    re: /\b(flight|airline|airport|hotel|trip|travel|itinerary|booking|reservation|check-?in|boarding|gate|terminal|passenger|departure|arrival|nights?|guests?|baggage)\b/i,
  },

  // ── Career ────────────────────────────────────────────────────────────────
  {
    cat: "career",
    sub: "offer",
    w: 7,
    reason: "job offer",
    re: /\b(offer letter|(job |employment |formal |verbal )?offer (of employment|details|from|for)|pleased to (extend|offer)|(excited|delighted|happy|thrilled) to (extend|offer) (you )?(an? )?(offer|position)|we('d| would) like to (offer|extend) you|compensation (package|details)|congratulations[^\n]{0,80}(offer|join(ing)? (us|our team)|welcome (aboard|to the team)))/i,
  },
  {
    cat: "career",
    sub: "rejection",
    w: 6,
    reason: "application declined",
    re: /\b(unfortunately[^\n]{0,160}(not (be )?(moving|move|proceed)|other candidates|decided (not )?to|not (selected|a fit|the right fit)|unable to (move|offer))|we (have )?decided to (move forward|proceed|pursue|go) (with )?(other|another|a different)|(position|role) has (been|now been) (filled|closed)|not (to )?(move|moving) forward with your (application|candidacy)|regret to inform|will not be (moving|proceeding) forward|we('ve| have) chosen (to pursue )?(other|another) candidate)/i,
  },
  {
    cat: "career",
    sub: "interview_request",
    w: 6,
    reason: "interview invitation",
    re: /\b(interview (confirmation|confirmed|scheduled|details|invitation|invite|request|availability)|invit(e|ation) (you )?to (an? )?(interview|chat|call|conversation|onsite)|(phone|video|technical|onsite|on-site|final|virtual|panel|behavioral|system design|coding|hiring manager) (screen|interview|round|loop)|schedule (a|an|your|the) (call|interview|chat|time|conversation)|(next|following) (step|round)s? (in|of) (the|our) (interview|hiring|recruiting) process|availability for (a|an) (interview|call|chat)|move (you )?forward to the next (round|stage))\b/i,
  },
  {
    cat: "career",
    sub: "assessment",
    w: 5.5,
    reason: "assessment invitation",
    re: /\b((coding|technical|online|take-?home|skills?) (assessment|challenge|test|exercise|evaluation)|hackerrank|codesignal|codility|hirevue|assessment (invitation|link|deadline|reminder)|complete (the|your|an) (assessment|challenge|test|exercise))\b/i,
  },
  {
    cat: "career",
    sub: "application_received",
    w: 5,
    reason: "application confirmation",
    re: /\b((thank(s| you) for|we('ve| have)? received your|confirm(ing)? (receipt of )?your) (application|interest in|applying)|application (received|submitted|confirmation|complete|was (sent|submitted))|you applied (to|for)|your application (was sent|has been (received|submitted|sent))|successfully applied)\b/i,
  },
  {
    cat: "career",
    sub: "application_update",
    w: 4.5,
    reason: "application update",
    re: /\b(application (status|update)|update (on|regarding|about) your (application|candidacy)|status of your application|still (reviewing|considering) (your|applications))\b/i,
  },
  {
    cat: "career",
    sub: "recruiter_outreach",
    w: 4.5,
    reason: "recruiter outreach",
    re: /\b((i'?m|i am) (a |the )?(technical )?(recruiter|talent partner|sourcer|hiring manager|head of talent)|(technical )?recruiter (at|with|for)|(came|come) across your (profile|background|work|github|linkedin)|your (background|experience|profile) (caught|stood|is|looks|seems)|(exciting|unique) (opportunity|role)|would you be (open|interested) (in|to)|open to (new )?(opportunities|a (quick )?(chat|call)|chatting|exploring))\b/i,
  },
  {
    cat: "career",
    sub: "job_alert",
    w: 4,
    reason: "job recommendations",
    re: /\b(jobs? (alert|for you|recommendations?|matching|you might like)|new jobs?( for you| matching| in)|recommended jobs?|jobs you may be interested|(\d+ )?new (opportunities|roles|positions|job matches) (for you|match)|job (digest|matches)|(is|are) hiring)\b/i,
  },
  {
    cat: "career",
    sub: "networking",
    w: 4,
    reason: "professional network activity",
    re: /\b(wants to connect|(accepted|accept) your (invitation|connection)|invitation to connect|new (connection|message from)|(sent|left) you a (new )?message|endorsed you|viewed your profile|appeared in \d+ searches|work anniversary)\b/i,
  },
  {
    cat: "career",
    w: 1.4,
    reason: "career vocabulary",
    re: /\b(application|candidate|candidacy|position|role|interview|recruit(er|ing)|hiring|job|career|resume|cv|opportunity|talent|onsite)\b/i,
  },

  // ── Events ────────────────────────────────────────────────────────────────
  {
    cat: "events",
    sub: "ticket",
    w: 5.5,
    reason: "tickets",
    re: /\b((your )?tickets? (are|is)? ?(confirmed|ready|attached|here|on the way)|e-?tickets?|admit (one|\d)|mobile tickets?|event (confirmation|tickets?|registration)|ticket (confirmation|purchase|order)|you('re| are) (registered|going) (for|to))\b/i,
  },
  {
    cat: "events",
    sub: "invitation",
    w: 5,
    reason: "invitation",
    re: /(\binvitation:|\bupdated invitation\b|\binvited you\b|\byou('re| are) invited\b|\b(event|meeting|calendar) invit(e|ation)\b|\bhas invited you\b|\brsvp\b|\bsave the date\b|^accepted:|^declined:)/i,
  },
  {
    cat: "events",
    sub: "reservation",
    w: 5,
    reason: "restaurant reservation",
    re: /\b((table|dinner|lunch|brunch|restaurant) (reservation|booking)|reservation (at|for) [^\n]{0,40}(party|people|guests|table|tonight)|your table (is|has been)|(opentable|resy|tock) (reservation|confirmation))\b/i,
  },
  {
    cat: "events",
    sub: "reminder",
    w: 3.5,
    reason: "event reminder",
    re: /\b((event|meeting|session|webinar) reminder|reminder:|starts (in \d+|tomorrow|soon|today)|(happening|coming up) (tomorrow|soon|this week))\b/i,
  },

  // ── Health ────────────────────────────────────────────────────────────────
  {
    cat: "health",
    sub: "appointment",
    w: 5,
    reason: "medical appointment",
    re: /\b(appointment (confirmation|confirmed|reminder|scheduled|request|is (confirmed|scheduled|coming up))|(upcoming|your) (appointment|visit|telehealth|video visit|check-?up)|schedule your (appointment|visit|checkup|annual|physical|cleaning)|(doctor|dentist|dental|vision|medical) appointment)\b/i,
  },
  {
    cat: "health",
    sub: "prescription",
    w: 5,
    reason: "prescription update",
    re: /\b(prescription|refill|rx (is )?ready|medication (is )?ready|ready for pick-?up at (the )?pharmacy)\b/i,
  },
  {
    cat: "health",
    sub: "results",
    w: 5,
    reason: "test results",
    re: /\b((lab|test) results?|results? (are|is) (ready|available|in)|new (test )?results?|after visit summary|visit summary)\b/i,
  },
  {
    cat: "health",
    sub: "claim",
    w: 4.5,
    reason: "insurance claim",
    re: /\b(explanation of benefits|\beob\b|claim (processed|received|update|status|has been)|your claim|benefits statement)\b/i,
  },
  {
    cat: "health",
    w: 1.2,
    reason: "health vocabulary",
    re: /\b(doctor|dr\.|clinic|medical|patient|pharmacy|dental|vision|telehealth|hospital|copay|deductible|prescription|mychart)\b/i,
  },

  // ── Low-signal mail ───────────────────────────────────────────────────────
  {
    cat: "newsletters",
    sub: "newsletter",
    w: 4,
    reason: "newsletter format",
    re: /\b(newsletter|issue (#|no\.?)?\s?\d+|weekly (digest|roundup|recap)|this week in|daily (digest|brief|briefing|roundup)|read (it )?(online|in (your )?browser)|from the editor|in today'?s (issue|edition)|the (morning|evening) brief)\b/i,
  },
  {
    cat: "social",
    sub: "notification",
    w: 4,
    reason: "social notification",
    re: /\b(liked your|commented on|mentioned you|tagged you|new follower|started following|shared (a|your) (post|photo)|replied to your|friend request|(new|unread) (notifications?|messages?) (on|from)|is live\b|reacted to|you have (new|\d+) (notifications|messages))\b/i,
  },
  {
    cat: "updates",
    sub: "policy",
    w: 3.5,
    reason: "policy update",
    re: /\b((terms|privacy policy|terms of (service|use)|user agreement|privacy notice) (update|change|changes|are changing)|we('re| are) (updating|changing) our (terms|privacy)|important (update|changes?) (to|about|regarding) (our|your))\b/i,
  },
  {
    cat: "updates",
    sub: "account_notice",
    w: 3,
    reason: "account notice",
    re: /\b(verify (your )?email|confirm (your )?(email|account)|welcome to|getting started|your account (has been |is )?(created|activated|ready|set up)|action required|activate your account|complete your (profile|account|setup))\b/i,
  },
  {
    cat: "updates",
    sub: "dev_alert",
    w: 4.5,
    reason: "service or deploy alert",
    re: /\b(deploy(ment)? (failed|error|errored|canceled)|build (failed|error|errored|broken)|(ci|workflow|pipeline|check) (run )?(failed|failing)|run failed|(security|vulnerability) (alert|advisory)|dependabot|vulnerabilit(y|ies) (found|detected)|incident (opened|report)|(service )?outage|downtime|is down\b|error rate|exceeded (your |the )?(quota|limit|usage|budget)|usage (alert|limit|threshold)|spend(ing)? (limit|alert|threshold|cap)|billing alert)\b/i,
  },
  {
    cat: "updates",
    sub: "product_update",
    w: 2.5,
    reason: "product announcement",
    re: /\b(product update|what'?s new|changelog|release notes|new features?|introducing|now available|we('ve| have) (launched|released|shipped))\b/i,
  },
];

const PROMO_RE =
  /\b(\d{1,2}% off|sale|deals?|discount|promo(tion|code)?|coupon|save (up to|\$|€|£|₹|\d)|limited[- ]time|flash sale|exclusive (offer|deal|access)|free shipping|shop now|buy now|black friday|cyber monday|clearance|just for you|don'?t miss|last chance|ends (tonight|soon|today|sunday|midnight)|new arrivals|best[- ]?sellers?|special offer|members?[- ]only|bogo|gift (guide|ideas)|treat yourself|trending now|unlock|upgrade now|try (it )?free|get \d+ months?)\b/gi;

/** Categories where we only trust a classification if a concrete subtype signal fired. */
const NEEDS_SUBTYPE = new Set<Category>(["subscriptions", "bills", "finance", "orders", "security", "travel", "career", "events", "health"]);

// Decisive subtypes win ties against routine ones when several fire in one email
// (a rejection usually also says "thank you for applying").
const SUBTYPE_BONUS: Record<string, number> = {
  "subscriptions:payment_failed": 3,
  "subscriptions:price_change": 2,
  "subscriptions:trial_ending": 2,
  "subscriptions:cancelled": 1.5,
  "bills:overdue": 3,
  "finance:fraud_alert": 3,
  "finance:low_balance": 2,
  "security:suspicious_activity": 3,
  "security:breach_notice": 3,
  "security:account_locked": 2,
  "security:password_changed": 1,
  "orders:delivered": 2,
  "orders:out_for_delivery": 2,
  "orders:delayed": 2,
  "orders:return": 1,
  "travel:flight_change": 3,
  "travel:checkin": 1.5,
  "career:offer": 4,
  "career:rejection": 4,
  "career:interview_request": 2,
  "career:assessment": 1.5,
};

const DEFAULT_SUBTYPE: Record<Category, string> = {
  subscriptions: "general",
  bills: "general",
  finance: "general",
  orders: "general",
  security: "general",
  travel: "general",
  career: "general",
  events: "general",
  health: "general",
  personal: "message",
  newsletters: "newsletter",
  promotions: "promotion",
  social: "notification",
  updates: "notice",
  other: "other",
};

export interface ClassifyInput {
  subject: string;
  text: string;
  fromName: string | null;
  fromAddress: string | null;
  headers: Record<string, string>;
  attachments: { filename: string; contentType: string }[];
  vendor: VendorMatch | null;
  amountCount: number;
}

function personalScore(input: ClassifyInput): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  const address = (input.fromAddress ?? "").toLowerCase();
  const local = address.split("@")[0] ?? "";
  const domain = domainOf(address);
  if (/(no-?reply|do-?not-?reply|notification|mailer|bounce|postmaster|support|^info$|^news|alerts?|billing|receipts?|updates?|marketing|hello$|team$)/i.test(local)) {
    return { score: -4, reasons };
  }
  let score = 0;
  if (input.headers["list-unsubscribe"] || /bulk|list/i.test(input.headers["precedence"] ?? "")) score -= 3;
  if (input.headers["auto-submitted"] && !/^no$/i.test(input.headers["auto-submitted"])) score -= 3;
  if (isConsumerDomain(domain)) {
    score += 3;
    reasons.push("sent from a personal mailbox");
  }
  const name = (input.fromName ?? "").trim();
  if (/^[\p{Lu}][\p{Ll}'’-]+(?:\s[\p{Lu}][\p{Ll}.'’-]*){1,2}$/u.test(name)) {
    score += 1.5;
    reasons.push("sender looks like a person");
  }
  if (/^(re|fwd?|aw|sv|antw):/i.test(input.subject.trim())) {
    score += 2;
    reasons.push("part of a conversation");
  }
  const head = input.text.slice(0, 300);
  if (/^(hi|hey|hello|dear|good (morning|afternoon|evening))\b[^\n]{0,30}[,!]/im.test(head)) score += 1;
  if (/\n\s*(thanks|thank you|best|cheers|regards|warmly|love|talk soon|sincerely|best regards|kind regards)[,!.]?\s*\n/i.test(input.text.slice(0, 4000))) score += 1;
  if (input.text.length < 2500) score += 0.5;
  return { score, reasons };
}

export function classify(input: ClassifyInput): Classification {
  const scores = new Map<Category, number>();
  const subScores = new Map<string, number>();
  const contributions = new Map<Category, { w: number; reason: string }[]>();
  const add = (cat: Category, w: number, reason: string, sub?: string) => {
    scores.set(cat, (scores.get(cat) ?? 0) + w);
    if (sub) subScores.set(`${cat}:${sub}`, (subScores.get(`${cat}:${sub}`) ?? 0) + w);
    const list = contributions.get(cat) ?? [];
    list.push({ w, reason });
    contributions.set(cat, list);
  };

  const subject = input.subject ?? "";
  const body = input.text.slice(0, 8000);

  for (const signal of SIGNALS) {
    if (signal.re.test(subject)) add(signal.cat, signal.w * 1.6, `Subject: ${signal.reason}`, signal.sub);
    else if (!signal.subjectOnly && signal.re.test(body)) add(signal.cat, signal.w, `Body: ${signal.reason}`, signal.sub);
  }

  // Sender priors.
  const vendor = input.vendor;
  if (vendor?.category) {
    const productCategory = vendor.product && vendor.kind ? KIND_CATEGORY[vendor.kind as VendorKind] : null;
    add(productCategory ?? vendor.category, 3, `Sender is ${vendor.name}${vendor.kind ? ` (${vendor.kind.replace("_", " ")})` : ""}`);
  }
  const address = input.fromAddress ?? "";
  for (const prior of ADDRESS_PRIORS) {
    if (prior.pattern.test(address)) {
      add(prior.category, 2.5, prior.reason);
      break;
    }
  }

  // Structure.
  if (input.amountCount > 0) {
    add("subscriptions", 0.8, "Contains a money amount");
    add("bills", 0.8, "Contains a money amount");
    add("finance", 0.8, "Contains a money amount");
    add("orders", 0.5, "Contains a money amount");
  }
  const hasCalendar = input.attachments.some((a) => /calendar|\.ics$/i.test(`${a.contentType} ${a.filename}`));
  if (hasCalendar) add("events", 3, "Includes a calendar invite");
  if (input.attachments.some((a) => /(invoice|receipt|statement|bill)/i.test(a.filename))) {
    add("subscriptions", 1.2, "Has an invoice/receipt attachment");
    add("bills", 1.2, "Has a statement attachment");
  }

  const promoMatches = `${subject}\n${body.slice(0, 4000)}`.match(PROMO_RE)?.length ?? 0;
  const listUnsub = !!input.headers["list-unsubscribe"];
  const bulk = /bulk|list/i.test(input.headers["precedence"] ?? "");
  if (promoMatches > 0) add("promotions", Math.min(8, promoMatches * 1.6), `${promoMatches} promotional phrase${promoMatches > 1 ? "s" : ""}`);
  if (listUnsub) {
    add("promotions", 1.5, "Bulk mail (List-Unsubscribe)");
    add("newsletters", 1.2, "Bulk mail (List-Unsubscribe)");
  }
  if (bulk) {
    add("promotions", 0.5, "Precedence: bulk");
    add("newsletters", 0.5, "Precedence: bulk");
  }

  const personal = personalScore(input);
  if (personal.score > 0) add("personal", personal.score, personal.reasons[0] ?? "Looks like a personal email");

  // Marketing email from a known subscription brand should not look like a receipt.
  const hasHardSubtype = (cat: Category) => [...subScores.keys()].some((k) => k.startsWith(`${cat}:`));
  if ((scores.get("promotions") ?? 0) >= 5) {
    for (const cat of NEEDS_SUBTYPE) {
      if (!hasHardSubtype(cat) && scores.has(cat)) scores.set(cat, (scores.get(cat) ?? 0) * 0.5);
    }
  }
  // Categories without a concrete signal get demoted so priors alone don't decide.
  for (const cat of NEEDS_SUBTYPE) {
    if (!hasHardSubtype(cat) && scores.has(cat)) scores.set(cat, (scores.get(cat) ?? 0) * 0.55);
  }

  const ranked = [...scores.entries()].filter(([cat]) => (CATEGORIES as readonly string[]).includes(cat)).sort((a, b) => b[1] - a[1]);
  let [category, top] = ranked[0] ?? ["other", 0];
  const second = ranked[1]?.[1] ?? 0;

  if (top < 2.2) {
    if (personal.score >= 2.5) {
      category = "personal";
      top = personal.score;
    } else if (promoMatches >= 2 || (listUnsub && promoMatches >= 1)) {
      category = "promotions";
    } else if (listUnsub) {
      category = "newsletters";
    } else if (/no-?reply|notifications?|alerts?|updates?/i.test(address)) {
      category = "updates";
    } else {
      category = "other";
    }
  }

  // Subtype: highest scoring signal family within the category.
  let subtype = DEFAULT_SUBTYPE[category];
  let bestSub = 0;
  for (const [key, value] of subScores) {
    const [cat, sub] = key.split(":") as [Category, string];
    const weighted = value + (SUBTYPE_BONUS[key] ?? 0);
    if (cat === category && weighted > bestSub) {
      bestSub = weighted;
      subtype = sub;
    }
  }

  const margin = top - second;
  const confidence = Math.max(0.05, Math.min(0.99, (top / (top + second + 1)) * Math.min(1, top / 7) + (margin > 4 ? 0.1 : 0)));
  const reasons = (contributions.get(category) ?? [])
    .sort((a, b) => b.w - a.w)
    .slice(0, 4)
    .map((c) => c.reason);
  if (category === "personal" && reasons.length === 0) reasons.push(...personal.reasons);
  if (reasons.length === 0) reasons.push("No strong signals — filed by sender type");

  return {
    category,
    subtype,
    confidence: Math.round(confidence * 100) / 100,
    reasons: [...new Set(reasons)],
    scores: Object.fromEntries(ranked.slice(0, 5).map(([c, s]) => [c, Math.round(s * 10) / 10])),
  };
}
