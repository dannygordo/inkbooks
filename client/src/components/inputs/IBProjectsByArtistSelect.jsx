import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import FormHelperText from "@mui/material/FormHelperText";
import FormControl from "@mui/material/FormControl";
import Select from "@mui/material/Select";
import { useState } from "react";
import IBAvatar from "./IBAvatar";
import { textAlign } from "@mui/system";
import { Tooltip, Typography } from "@mui/material";

const IBProjectsByArtistSelect = ({
	data,
	label,
	onChange,
	autoWidth = true,
	helperText,
	inputRef,
	selectedVal,
	setSelectedVal,
	defaultValue,
}) => {
	const handleOnChange = (e) => {
		if (onChange) {
            onChange(e);
		} else {
			console.log(e.target.value);
		}
	};

	return (
		<FormControl sx={{ minWidth: 120, marginTop: 2 }}>
			<InputLabel id="demo-simple-select-helper-label">
				{label}
			</InputLabel>
			<Select
				labelId="demo-simple-select-helper-label"
				id="demo-simple-select-helper"
				value={selectedVal}
				autoWidth={autoWidth}
				label={label}
				defaultValue={defaultValue}
				onChange={handleOnChange}
				inputRef={inputRef}
			>
				<MenuItem value="">
					<em>None</em>
				</MenuItem>
				{data.map((item) => {
					return (
						<MenuItem key={item.id} value={item.id}>
							<div
								style={{
									maxWidth: 450,
									display: "flex",
									flexDirection: "row",
									justifyContent: "space-between",
								}}
							>
								<Tooltip
									disableFocusListener
									disableTouchListener
									title={`${item.client.user.firstName} ${item.client.user.lastName}`}
								>
									<div>
										<IBAvatar
											imgUrl={item.client.user.avatar}
											size="small"
										/>
									</div>
								</Tooltip>
								<div
									style={{
										display: "flex",
										flexDirection: "column",
										alignContent: "space-between",
										marginLeft: "10px",
									}}
								>
									<div style={{ width: "350px" }}>
										<Typography
											noWrap
											sx={{
												fontWeight: 600,
												fontSize: "14px",
											}}
										>
											{item.title}
										</Typography>
									</div>
									<div style={{ width: "350px" }}>
										<Typography
											noWrap
											sx={{ fontSize: "14px" }}
										>
											{item.description}
										</Typography>
									</div>
								</div>
							</div>
						</MenuItem>
					);
				})}
			</Select>
			<FormHelperText>{helperText}</FormHelperText>
		</FormControl>
	);
};

export default IBProjectsByArtistSelect;
