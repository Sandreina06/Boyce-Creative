# Pixel troubleshooting: an event shows up that nobody set up

Typical report: "Test Events shows `Subscribe` when I click Add to Cart, but Manage Events has
no rule for Subscribe."

Rules in **Manage Events** (the Event Setup Tool) are only one of several ways an event can
reach a dataset, so deleting rules there often changes nothing. Before changing any settings,
work out **where the event comes from**.

## Step 1: read the event's source (2 minutes, decides everything else)

In Events Manager → the dataset → **Test Events**, trigger the action, then click the wrong
event to expand it. Write down:

- the **exact event name**: `Subscribe` or `SubscribedButtonClick`? They are different (see A);
- **Received from:** Browser or Server;
- **Setup method** / integration: *Automatic events*, *Code*, *Event setup tool*, or a partner
  such as *Squarespace*;
- the **URL** it fired on and its **parameters** (for example `content_name`, `value`,
  `button_text`).

Then check it again in the browser:

- **Meta Pixel Helper** (Chrome extension): it lists every event the page sends and labels
  automatically detected ones.
- **DevTools → Network**, filter `facebook.com/tr`, click Add to Cart, and find the request with
  `ev=Subscribe`. Its **Initiator** column and call stack name the script that sent it (Meta's
  own `fbevents.js` automatic logic, a Squarespace script, GTM's `gtm.js`, or an inline
  snippet).

## Step 2: match the source to a cause

| What Step 1 shows | Cause | Fix |
|---|---|---|
| Event is `SubscribedButtonClick` | **A. Automatic button-click metadata.** The pixel sends this on every button click when automatic configuration is on. It isn't the `Subscribe` standard event, you can't optimise for it, and it doesn't count as a conversion. | Nothing is broken. To silence it, turn off automatic configuration in the dataset settings, or add `fbq('set', 'autoConfig', false, '<PIXEL_ID>')` before `fbq('init')`. |
| `Subscribe`, Browser, setup method **Automatic events** (or no rule anywhere) | **B. Meta's automatic event detection.** Meta infers standard events from button text, page content and URL. This setting is separate from the Event Setup Tool, so **it never shows up as a rule in Manage Events.** A button like "Build my 6-pack" or a box/plan product page can be read as a subscription. | Dataset → **Settings** → the automatic events section ("Automatic events" / "Track events automatically without code"). Turn it off, or turn off the individual inferred `Subscribe` event if it's listed. The site's own integration already sends the correct commerce events. |
| `Subscribe`, Browser, **Code** | **C. A script calls `fbq('track','Subscribe')`.** | Look beyond site-wide Code Injection: **per-page** header injection (Page settings → Advanced), **Code blocks** on the page, product "additional info" blocks, the **GTM container** (tags with a click trigger), and the landing-page builder's own tracking settings if landing pages live on a separate subdomain or tool. Remove or remap the call. |
| `Subscribe`, Browser, **Event setup tool** | **D. A rule on a different dataset or domain.** Rules are stored per dataset and URL. | Check Manage Events on every dataset that fires on the page (Pixel Helper shows the ids) and for each domain/subdomain. |
| `Subscribe`, **Server** | **E. Conversions API / partner integration.** The platform, not the browser, sends it. For example, a product set up as a subscription product, or an email/SMS app that sends Subscribe for signups. | Check the partner's settings in Events Manager → **Partner integrations** and in the store platform. Check whether the product is set up as a subscription item. |
| Both `AddToCart` and `Subscribe` on one click | Usually the platform sends AddToCart correctly and a second source (B or C) adds Subscribe. | Remove the second source, not the platform integration. |
| The same event twice | Pixel installed twice (native integration + Code Injection or GTM). | Keep one base pixel install. |

## Step 3: prove the fix

1. Open Test Events → **Open website** (so the session is attributed), then go through
   landing page → product → add to cart → checkout → test purchase.
2. The expected sequence is `PageView`, `ViewContent`, `AddToCart`, `InitiateCheckout` and
   `Purchase`, with **no `Subscribe`**.
3. Settings changes can take several minutes to reach the browser, and `fbevents.js` is
   cached. Retest in a fresh incognito window before concluding the fix failed.
4. Any ad set that was optimising for `Subscribe` must be switched to the right event. Changing
   the optimisation event restarts learning.

## Reporting

Tell the client which source it was (A–E), what you changed and where, and the retest result.
If you couldn't access something (Events Manager, the site admin), say what you need from
them.
