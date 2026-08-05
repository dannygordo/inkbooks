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
 * while to find one name. The same forty as rows fit on one or two screens and let the eye run
 * down a single axis. Cards suit a handful of things you browse; every one of these pages is a
 * directory.
 *
 * COLUMNS ARE DECLARED, NOT INFERRED. The first version of this rendered each row's values as
 * flex items, so every column was as wide as its own content and nothing lined up from one row to
 * the next - a phone number under an email under a name, all starting at different x positions.
 * That defeats the entire reason for using a list: you scan a column by holding your eye still
 * and letting the rows move past it, which only works if the column doesn't move.
 *
 * So the caller declares `columns` once, every row is laid out on the same CSS grid built from
 * them, and a header labels each one at the top instead of every value carrying its own label.
 * Fixed widths rather than fractional ones: `1fr` columns re-solve against their content, which
 * would put the header and body on different grids the moment one row had a longer email.
 *
 * @param {Array} columns - [{ key, label, width }] - width is any CSS length
 * @param {Array} items - [{ key, linkTo, avatar, primary, secondary, values: {colKey: value},
 *   tagColor, archived }] - `archived` mutes the row and labels it, so a list showing archived
 *   records doesn't look like a list of active ones.
 * @param {string} emptyMessage
 */
const EntityList = ({ columns = [], items, emptyMessage = "Nothing here yet." }) => {
	const navigate = useNavigate();
	const [hoveredKey, setHoveredKey] = useState(null);

	if (!items || items.length === 0) {
		return <div className="entityListEmpty">{emptyMessage}</div>;
	}

	// Avatar, then the name column taking whatever is left, then one track per declared column.
	// minmax(0, 1fr) rather than 1fr on the name: a bare 1fr floors at the content's min width,
	// so a long project title would push the columns rightward and break the alignment this
	// exists to guarantee. minmax(0, ...) lets it actually shrink and ellipse.
	const gridTemplate = `40px minmax(0, 1fr) ${columns
		.map((c) => c.width || "160px")
		.join(" ")}`;

	return (
		<div className="entityList">
			<div className="entityListHeader" style={{ gridTemplateColumns: gridTemplate }}>
				{/* Two empty cells for the avatar and name tracks - the name column's heading would
				    just say "Name" above an obvious list of names. */}
				<span />
				<span />
				{columns.map((column) => (
					<span key={column.key} className="entityHeaderCell">
						{column.label}
					</span>
				))}
			</div>

			{items.map((item) => (
				<div
					key={item.key}
					className={[
						"entityRow",
						item.linkTo ? "entityRowClickable" : "",
						item.archived ? "entityRowArchived" : "",
					]
						.filter(Boolean)
						.join(" ")}
					style={{
						gridTemplateColumns: gridTemplate,
						// Tinted by tag colour where the row belongs to someone who has one - same
						// treatment as every other list showing artist data (see utils/tagColor.js).
						// Rows without one (a shop, a project) still reserve the 4px border so the
						// left edge doesn't stagger.
						...(item.tagColor
							? tagColorRowStyle(item.tagColor, hoveredKey === item.key)
							: {}),
					}}
					onMouseEnter={() => setHoveredKey(item.key)}
					onMouseLeave={() => setHoveredKey(null)}
					onClick={item.linkTo ? () => navigate(item.linkTo) : undefined}
				>
					{/* Kept from the cards. An avatar is how people recognise a row in a list of
					    names; dropping it for density would make this harder to scan, not easier. */}
					<IBAvatar size={40} imgUrl={item.avatar} label={item.primary} />
					<div className="entityRowText">
						<span className="entityRowPrimary">
							{item.primary}
							{item.archived && <span className="entityRowArchivedTag">Archived</span>}
						</span>
						{item.secondary && (
							<span className="entityRowSecondary">{item.secondary}</span>
						)}
					</div>
					{columns.map((column) => {
						const value = item.values ? item.values[column.key] : null;
						return (
							<span
								key={column.key}
								className="entityRowCell"
								// Carried for the narrow-screen layout, where the grid collapses and
								// each value needs its own label back - the header is off-grid there.
								data-label={column.label}
							>
								{/* An em dash, not an empty cell. A blank in a grid of aligned
								    values reads as a rendering fault; a dash reads as "not set",
								    which is the fact. The cards drew a bare icon with nothing next
								    to it, which was the same problem with more ink. */}
								{value === null || value === undefined || value === ""
									? "—"
									: value}
							</span>
						);
					})}
				</div>
			))}
		</div>
	);
};

export default EntityList;
