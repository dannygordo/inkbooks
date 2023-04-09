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
					<ListItem key={`${tag}${Date.now()}`}>
						<Chip label={tag} onDelete={(e) => {handleDelete(e, tag)}} />
					</ListItem>
				);
			})}
		</Paper>
	);
};

export default IBTagsWidget;
