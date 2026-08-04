import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import IBAvatar from "../inputs/IBAvatar";
import { tagColorRowStyle } from "../../utils/tagColor";
import "./entityList.css";

/**
 * The one list used everywhere a set of records is shown - artists, clients, projects, staff,
 * shops - replacing the card grid each of those pages used to build.
 *
 * Why lists rather than cards. A card is a fixed-height tile roughly 300px square showing five or
 * six labelled fields; a shop with forty clients gets forty tiles and a page you scroll for a
 * while to find one name. The same forty as rows fit on one or two screens, sort into scannable
 * columns, and let the eye run down a single axis instead of tracking a grid. Cards are a good
 * shape for a handful of things you browse and a bad one for a directory you search - and every
 * one of these pages is a directory.
 *
 * Nothing the cards displayed is dropped. The fields move from stacked icon rows inside a tile to
 * a primary line, a secondary line, and a set of labelled meta values on the right.
 *
 * Deliberately a data-driven list rather than a component per entity: five near-identical lists
 * is exactly how the card components ended up as six files that each render the same three divs
 * with different field names. Each page maps its own records to a common row shape and this
 * renders them.
 *
 * @param {Array} items - row descriptors:
 *   { key, linkTo, avatar, primary, secondary, meta: [{label, value}], tagColor }
 * @param {string} emptyMessage
 */
const EntityList = ({ items, emptyMessage = "Nothing here yet." }) => {
	const navigate = useNavigate();
	const [hoveredKey, setHoveredKey] = useState(null);

	if (!items || items.length === 0) {
		return <div className="entityListEmpty">{emptyMessage}</div>;
	}

	return (
		<div className="entityList">
			{items.map((item) => (
				<div
					key={item.key}
					className={
						item.linkTo ? "entityRow entityRowClickable" : "entityRow"
					}
					// Tinted by tag colour where the row belongs to a person who has one - same
					// treatment as every other list showing artist data (see utils/tagColor.js).
					// Rows without one (a shop, a project) get no tint and simply reserve the
					// same 4px so the column doesn't stagger.
					style={item.tagColor ? tagColorRowStyle(item.tagColor, hoveredKey === item.key) : undefined}
					onMouseEnter={() => setHoveredKey(item.key)}
					onMouseLeave={() => setHoveredKey(null)}
					onClick={item.linkTo ? () => navigate(item.linkTo) : undefined}
				>
					{/* Kept from the cards. An avatar is how people actually recognise a row in a
					    list of names, and dropping it in the name of density would make this
					    harder to scan, not easier. */}
					<IBAvatar size={40} imgUrl={item.avatar} label={item.primary} />
					<div className="entityRowText">
						<span className="entityRowPrimary">{item.primary}</span>
						{item.secondary && (
							<span className="entityRowSecondary">{item.secondary}</span>
						)}
					</div>
					<div className="entityRowMeta">
						{(item.meta || [])
							// Empty values are dropped rather than rendered as a label with
							// nothing under it. The cards showed a bare icon with blank text for
							// every unfilled field - a client with no Instagram got an Instagram
							// icon and empty space, which reads as a rendering fault.
							.filter((m) => m && m.value !== null && m.value !== undefined && m.value !== "")
							.map((m) => (
								<span className="entityRowMetaItem" key={m.label}>
									<span className="entityRowMetaLabel">{m.label}</span>
									<span className="entityRowMetaValue">{m.value}</span>
								</span>
							))}
					</div>
				</div>
			))}
		</div>
	);
};

export default EntityList;
