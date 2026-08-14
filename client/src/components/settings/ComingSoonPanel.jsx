import React from "react";
import IBCardWrapper from "../card/ibCard/IBCardWrapper";

/**
 * A category the new Settings nav names but doesn't have real content for yet - Calendar, Taxes,
 * Messages, Forms, Analytics, at the time this shell was built (see settingsCategories.js).
 *
 * Shown rather than hidden. The point of grouping settings "by type" was to give every kind of
 * config a known home even before it exists, so someone looking for "where would I turn off SMS
 * reminders" finds the right category and a plain "not built yet" rather than concluding the
 * feature doesn't exist at all or hunting through unrelated categories for it.
 */
const ComingSoonPanel = ({ label, description }) => (
	<IBCardWrapper>
		<div>
			<h1>{label}</h1>
			<p className="settingsPanelHelp">
				{description || "Nothing to configure here yet - this section is on the way."}
			</p>
		</div>
	</IBCardWrapper>
);

export default ComingSoonPanel;
