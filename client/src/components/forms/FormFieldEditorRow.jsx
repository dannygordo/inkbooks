import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button, Checkbox, IconButton } from "@mui/material";
import { Close, DragIndicator } from "@mui/icons-material";
import IBInput from "../inputs/IBInput";
import IBSelect from "../inputs/IBSelect";
import { APP_SETTINGS_CONSTANTS } from "../../constants";

const CHOICE_TYPES = APP_SETTINGS_CONSTANTS.FORM_CHOICE_FIELD_TYPES;

/**
 * Task #160 - one draggable row in FormBuilder.jsx's field editor. Split out from FormBuilder
 * itself for the same reason FormField/FormFieldsRenderer already are their own files: the drag
 * wiring (useSortable, transform/transition style, the drag-handle listeners) has nothing to do
 * with the surrounding page and reads better isolated from it.
 *
 * useSortable's `id` is field._localId - see FormBuilder.jsx's own comment on why that local id
 * (not the server `key`, which is undefined for a brand-new field) is the one stable identity a
 * field has for the whole time it lives in this list, drag included.
 *
 * The DRAG HANDLE is a separate small target (the DragIndicator icon), not the whole row - a
 * row's own inputs need normal click/drag-to-select-text behavior, which a whole-row
 * pointer-down-to-drag listener would fight with on every text field in it.
 */
const FormFieldEditorRow = ({
	field,
	onLabelChange,
	onTypeChange,
	onHelpTextChange,
	onRequiredChange,
	onRemove,
	onAddOption,
	onOptionChange,
	onRemoveOption,
}) => {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id: field._localId,
	});

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.5 : 1,
	};

	return (
		<div className="fieldEditorRow" ref={setNodeRef} style={style}>
			<div className="fieldEditorTopLine">
				<button
					type="button"
					className="fieldEditorDragHandle"
					aria-label="Drag to reorder"
					{...attributes}
					{...listeners}
				>
					<DragIndicator fontSize="small" />
				</button>
				<IBInput
					label="Question"
					value={field.label}
					onChange={(e) => onLabelChange(e.target.value)}
					required
				/>
				<IBSelect
					id={`fieldType-${field._localId}`}
					label="Type"
					data={APP_SETTINGS_CONSTANTS.FORM_FIELD_TYPES}
					selectedVal={field.type}
					onChange={(e) => onTypeChange(e.target.value)}
				/>
				<div className="fieldEditorRowButtons">
					<IconButton size="small" onClick={onRemove} aria-label="Remove field">
						<Close fontSize="small" />
					</IconButton>
				</div>
			</div>

			<IBInput
				label="Help text (optional)"
				value={field.helpText}
				onChange={(e) => onHelpTextChange(e.target.value)}
			/>

			<label className="fieldEditorRequiredRow">
				<Checkbox
					size="small"
					checked={field.required}
					onChange={(e) => onRequiredChange(e.target.checked)}
				/>
				Required
			</label>

			{CHOICE_TYPES.includes(field.type) && (
				<div className="fieldEditorOptions">
					{(field.options || []).map((option, idx) => (
						<div className="fieldEditorOptionRow" key={idx}>
							<IBInput
								label={`Option ${idx + 1}`}
								value={option}
								onChange={(e) => onOptionChange(idx, e.target.value)}
							/>
							<IconButton size="small" onClick={() => onRemoveOption(idx)} aria-label="Remove option">
								<Close fontSize="small" />
							</IconButton>
						</div>
					))}
					<Button size="small" onClick={onAddOption}>
						Add option
					</Button>
					{(field.options || []).filter((o) => o.trim()).length < 2 && (
						<p className="formFieldError">A choice field needs at least two options.</p>
					)}
				</div>
			)}
		</div>
	);
};

export default FormFieldEditorRow;
