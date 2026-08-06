import React from "react";
import './ibCard.css';

/**
 * A plain card container.
 *
 * NO key={Date.now()}. Both branches used to carry one, and it is the reason every input inside a
 * card lost focus after each keystroke.
 *
 * A key tells React which element in a LIST corresponds to which element from the previous render.
 * A new key means "this is a different thing" - so React throws the old subtree away and mounts a
 * fresh one. Date.now() is a new value on every render, so this card and everything inside it were
 * destroyed and rebuilt whenever anything above re-rendered. Typing one character into the booking
 * link updates parent state, the parent re-renders, the card remounts, and the input the cursor was
 * in no longer exists.
 *
 * The key was doing nothing useful even in principle: it sat on the single root element of a
 * component with no siblings, which is the one position where a key is never read for
 * reconciliation. It was pure cost.
 *
 * Same mistake as the one already fixed in Messenger.jsx, where each conversation row was keyed
 * `${Date.now()}${conversation.id}` and the whole list was rebuilt on every render. Worth naming
 * twice: it produces no error and no warning, and looks like diligence.
 *
 * handleClick is deliberately gone too - `onClick={(e) => handleClick}` RETURNED the handler
 * instead of calling it, so the clickable variant never fired. Nothing in the app passed the prop,
 * so this removes a broken branch rather than a feature. If a clickable card is wanted later, it
 * should be written as onClick={handleClick} and given a real test.
 */
const IBCardWrapper = ({ children }) => (
	<div className="ibCardWrapper">{children}</div>
);

export default IBCardWrapper;
