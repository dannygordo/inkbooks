import { styled } from "@mui/material/styles";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import { useEffect, useState } from "react";

const ListItem = styled("li")(({ theme }) => ({
	margin: theme.spacing(0.5),
}));

const IBTagsWidget = ({ tags, onDelete }) => {
    // const [tagData, setTagData] = useState(tags);
    // useEffect(() => {
    //     setTagData(tags);
    // }, [tags]);

	const handleDelete = (e, tagToDelete) => {
		e.preventDefault();
		if (onDelete) {
			onDelete(e, tagToDelete);
		} else {
			//console.log(tagToDelete);
			//setTags((tags) => tags.filter((tag) => tag !== tagToDelete));
		}
	};
	return (
		<Paper
			sx={{
				display: "flex",
				justifyContent: "left",
				flexWrap: "wrap",
				listStyle: "none",
				p: 0.5,
				m: 0,
			}}
			component="ul"
		>
			{tags.map((tag) => {
				return (
					// The tag itself, not `${tag}${Date.now()}`. Tags are unique within a project, so the
					// tag IS the stable identity; appending the clock made every key new on every render
					// and rebuilt the whole list each time. See IBCardWrapper.jsx.
					<ListItem key={tag}>
						<Chip label={tag} onDelete={(e) => {handleDelete(e, tag)}} />
					</ListItem>
				);
			})}
		</Paper>
	);
};

export default IBTagsWidget;
