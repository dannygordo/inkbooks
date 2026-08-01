import { Send } from "@mui/icons-material";
import { Button } from "@mui/material";

const IBButton = ({
	variant = "contained",
	type = "button",
	text = "",
  endIcon = <Send />
}) => {
	return (
		<Button variant={variant} endIcon={endIcon} type={type}>
			{text}
		</Button>
	);
};

export default IBButton;
