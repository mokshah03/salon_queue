# Salon Queue Management System — Implementation Prompts

Follow the steps sequentially. **Implement only the requested step; do not proceed to the next until instructed.** Refer to `docs/02-screens.md` and `docs/03-flows-rules.md` wherever specified.

## 1. MERN Project Setup

Implement Step 1 only.

- Set up MERN using React + Vite, Node.js + Express, MongoDB and Mongoose. Use JavaScript throughout.
- Create modular frontend/backend structures with folders for Customer, Staff, Admin and Display.
- Configure npm scripts, MongoDB connection and a backend health-check endpoint.
- Check Node.js, npm and existing MongoDB availability before proceeding. Install only essential npm dependencies; do not download unnecessary applications.
- Use normal CSS. Do not install Tailwind, TypeScript, Socket.IO, Redux, Redis, Docker or additional databases.
- Verify frontend and backend run successfully on localhost.

Do not build application screens yet.

**Report:** Folder structure, created files, dependencies, setup commands and test commands.

## 2. Customer Services & Check-in

Build only the Customer Services and Check-in screens from `docs/02-screens.md`.

Display realistic salon services in these categories:
- Hair Services
- Skin Care
- Nail Services
- Grooming

Each service must include name, description, price (INR), estimated duration and availability.

Implement:
- Search by service name and category filtering.
- Select/deselect services and display selected service details.
- Optional stylist preference.
- Customer name and mobile number validation.
- Join Queue button with submission confirmation.

Use realistic dummy data, responsive layouts and a minimal, premium salon-inspired design.

Prevent selection of unavailable services. Validate important fields on both frontend and backend.

Do not build Staff, Admin or Display screens. Test all interactions and avoid modifying unrelated screens.

## 3. Queue Management, Token Generation & Customer Tracking

Implement queue joining, token generation and customer tracking using `docs/02-screens.md` and `docs/03-flows-rules.md`.

**Backend and token system:**
- Persist queue entries in MongoDB using Mongoose.
- Generate unique sequential daily tokens: `S-001`, `S-002`, etc.
- Reset numbering to `001` each new calendar day.
- Use a dedicated daily counter collection and atomic database updates to prevent duplicate tokens during simultaneous check-ins.
- Prevent duplicate submissions and validate customer details, services and requests.

**Customer tracking page:** `/queue/:id`

Display:
- Large token number and customer name.
- Selected service and assigned/preferred stylist.
- Queue position and estimated waiting time.
- Current status and progress indicator.

Support status transitions:

`WAITING → CALLED → IN SERVICE → COMPLETED`

Also support `CANCELLED` and `NO SHOW` according to queue rules. Restrict cancellation to permitted stages.

Calculate estimated waiting time using service duration, active queue entries and available stylists. Clearly label it as an estimate.

Use frontend polling every 3–5 seconds. No Socket.IO or other real-time libraries. Preserve tracking information after refresh.

**Test:** Token sequencing, daily reset, simultaneous check-ins, duplicate prevention, queue position, waiting-time estimates, cancellation, refresh, invalid requests and MongoDB persistence.

Do not modify unrelated screens.

## 4. Staff Queue Dashboard

Build `/staff/queue` using `docs/02-screens.md`.

Create three sections:
1. WAITING
2. CALLED
3. IN SERVICE

Each customer card must show token, name, service, duration, preferred/assigned stylist, check-in time, waiting time and status.

Implement:
- Call Next Customer.
- Start Service.
- Complete Service.
- Mark No Show.
- Return to Queue where permitted.
- Filter by service and stylist.
- Highlight customers exceeding estimated waiting time.

Enforce valid status transitions on the backend. Prevent simultaneous staff actions from calling or starting the same customer.

Use 3–5 second polling to refresh the dashboard. Persist changes in MongoDB and reflect updates on customer tracking and Display screens.

**Test:** Multiple customers, simultaneous staff actions, invalid transitions and multiple browser sessions.

Build only this screen and its required functionality.

## 5. Live Waiting Room Display

Build `/display` as an independent, full-screen salon display with an elegant dark, premium design.

**NOW SERVING:**
- Large token number.
- Stylist name.
- Service name.

**UP NEXT:**
- Next few customer tokens in queue order.
- Relevant stylist information when available.

Requirements:
- Optimize for 1920×1080 TV screens, with readable token numbers from several metres away.
- Poll backend every 3–5 seconds.
- Highlight newly called tokens with a subtle animation for approximately 5 seconds.
- Remove completed, cancelled and no-show entries from the active display.
- Never expose customer phone numbers or unnecessary personal information.
- Work independently without navigation or manual refreshing.

**Test:** New check-ins, customer calls, service start/completion, multiple customers, empty queue, automatic updates and full-screen responsiveness.

Do not use Socket.IO or additional real-time libraries.

## 6. Admin Dashboard & Salon Management

Build `/admin` using `docs/02-screens.md`.

**Service Management:**
- Add, edit and delete services.
- Mark services available/unavailable.
- Store name, category, description, price, duration and availability.

**Stylist Management:**
- Add, edit and safely delete stylists.
- View specialties.
- Manage availability.
- Assign services to stylists.
- Never delete stylists with active queue assignments without safely handling those assignments.

**Dashboard Statistics — Today's Summary:**
- Total customers checked in.
- Currently waiting.
- Currently being served.
- Completed services.
- Average waiting time.
- Most popular service.

**Queue Management:**
- View today's queue.
- Monitor stylist availability.
- Manage services and stylist assignments.

Persist all changes in MongoDB using Mongoose and validate inputs on the backend.

Use polling to refresh dashboard data. Ensure service and stylist availability changes reflect across Customer and Staff screens.

Maintain a clean, responsive and consistent design.

Do not add payments, appointment booking, loyalty programs, inventory management or unrelated features.

**Test:** CRUD operations, persistence, queue updates and cross-screen synchronization.

## 7. End-to-End Testing & QA Audit

Act as a senior QA engineer. Audit and run the entire application, testing actual functionality rather than only inspecting source code.

**End-to-end workflow:**
1. Customer opens services, searches, filters and selects services.
2. Customer enters details and joins the queue.
3. Unique daily token is generated.
4. Customer appears on Staff Dashboard.
5. Staff calls the next customer.
6. Customer tracking updates automatically.
7. Staff starts and completes the service.
8. Completed customer disappears from the active queue.
9. Waiting-room display updates automatically.
10. Admin adds a service and it appears on Customer screen.
11. Admin marks a service unavailable and customers cannot select it.
12. Admin changes stylist availability and queue reflects the update.

**Edge-case testing:**
- Empty name, missing/invalid mobile number and no service selected.
- Unavailable services and duplicate submissions.
- Simultaneous check-ins and duplicate tokens.
- Daily token reset.
- Cancellation, including after service starts.
- Invalid status transitions.
- No available stylists or stylist becoming unavailable while customers wait.
- Multiple services with different durations.
- Empty queue and browser refresh during an active entry.
- Backend restart and MongoDB connection failure/disconnection.
- Multiple browser windows and temporary polling disconnections.
- Negative/invalid prices and durations.
- Deleting services with active queue entries.

**QA requirements:**
- Fix every reproducible bug.
- Verify frontend/backend validation and MongoDB persistence.
- Verify token uniqueness, daily reset, queue position and waiting-time calculations.
- Verify stylist assignment and availability.
- Verify polling across browser sessions.
- Test mobile, tablet and desktop responsiveness.
- Check every button and interaction for functionality.
- Add useful errors and empty states.
- Add automated tests for critical queue business logic.
- Test backend error handling and MongoDB disconnection recovery.
- Run local production build checks. Do not deploy.

**Final Report:**
1. Implemented features.
2. Test results in PASS/FAIL format.
3. Known limitations and remaining bugs.
4. Exact application startup commands.
5. Localhost URLs for all screens.
6. Automated test results.
7. Production build result.
8. Complete installed npm dependency list.

**Strict rules:**
- Never claim a feature works unless actually tested.
- Do not introduce unnecessary features.
- Do not redesign working screens unnecessarily.
- Follow the requested implementation step only.
- Preserve existing functionality when implementing subsequent steps.
