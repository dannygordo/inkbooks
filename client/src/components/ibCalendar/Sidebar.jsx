import CreateEventButton from "./CreateEventButton";
import "./ibCalendar.css";
import SmallCalendar from "./SmallCalendar";

// The per-artist checkbox filter that used to live here has been removed. Three reasons, in
// increasing order of how much they mattered:
//
//  1. It had no real audience. An independent artist has no shop-mates to filter between, and a
//     shop admin opening the shop calendar wants to see everybody - that's what the view is for.
//     The only caller in between is an artist at a shop, and "everyone at my shop" is a reasonable
//     default for them too.
//
//  2. It didn't work. Unchecking recomputed the list as `savedEvents.filter(all but this artist)`,
//     discarding every other checkbox's state - uncheck two artists in a row and the first one
//     reappears. Checking appended `[...filteredEvents, ...matching]` with no dedupe, so toggling
//     the same artist twice showed their appointments twice. With three or more artists the
//     checkboxes and the calendar disagreed from the second click onward.
//
//  3. It sat between the data and the render. Day.jsx read `filteredEvents`, not `savedEvents`,
//     so that broken state was what the calendar actually drew - an empty or stale
//     `filteredEvents` meant a blank calendar with no indication why.
//
// It also turned archiving an artist into a question with no good answer: leave them in the filter
// list forever, or drop them and have their past appointments silently vanish. With no filter, old
// appointments keep rendering in their own colour and nobody has to decide.
//
// If a large shop's month view ever does get too dense to read, the fix is a single "just mine"
// toggle or a day/week view - one boolean, not an N-artist list that has to stay in sync.
const Sidebar = () => {
	return (
		<aside className="ibCalendarAsideContainer">
			<CreateEventButton />
			<SmallCalendar />
		</aside>
	);
};

export default Sidebar;
