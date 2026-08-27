import React, { useEffect, useState } from "react";
import { useParams, Link as RouterLink } from "react-router-dom";
import { useMutation } from "@apollo/client";
import { Button, Checkbox } from "@mui/material";
import {
	DndContext,
	KeyboardSensor,
	PointerSensor,
	closestCenter,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	SortableContext,
	arrayMove,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DragIndicator } from "@mui/icons-material";
import FormService from "../../services/FormService";
import IBPageLoader from "../../components/ibPageLoader/IBPageLoader";
import IBInput from "../../components/inputs/IBInput";
import { useAuth } from "../../context/auth";
import { ALERT_CONSTANTS, ROUTE_CONSTANTS } from "../../constants";
import "./forms.css";

/**
 * Task #162 - the booking_request system form's own editor. Deliberately NOT FormBuilder.jsx: the
 * real BookingRequest pipeline (mutations/bookingRequests.js's createBookingRequest, the
 * BookingRequest model, /book/:artistHandle) stays completely untouched, byte for byte, per
 * explicit decision - it always accepts exactly these seven optional slots (placement, size,
 * budget, availability, howHeard, isCoverUp, referenceImages) and no others. This page can only
 * REORDER them, RELABEL them, toggle REQUIRED, and toggle HIDDEN - never add a field, remove one,
 * or change its type, because the pipeline underneath has no way to honor any of those.
 *
 * updateBookingRequestFields (server/graphql/resolvers/forms.js) enforces the same exact-key-set
 * restriction independently - this page not offering Add/Remove controls is a UX nicety, not the
 * actual guarantee.
 */
const SortableBookingField = ({ field, onLabelChange, onRequiredChange, onHiddenChange }) => {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id: field.key,
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
				<IBInput label="Question" value={field.label} onChange={(e) => onLabelChange(e.target.value)} />
			</div>
			<div className="fieldEditorRequiredRow">
				<label className="fieldEditorRequiredRow">
					<Checkbox
						size="small"
						checked={field.required}
						onChange={(e) => onRequiredChange(e.target.checked)}
					/>
					Required
				</label>
				<label className="fieldEditorRequiredRow">
					<Checkbox
						size="small"
						checked={!field.hidden}
						onChange={(e) => onHiddenChange(!e.target.checked)}
					/>
					Shown on the booking page
				</label>
			</div>
		</div>
	);
};

const BookingRequestFieldsEditor = () => {
	const { formId } = useParams();
	const { setAlert } = useAuth();

	const { data, loading } = FormService.getForm(formId);
	const [fields, setFields] = useState([]);
	const [loadedFormId, setLoadedFormId] = useState(null);

	useEffect(() => {
		const form = data?.getForm;
		if (form && form.id !== loadedFormId) {
			setFields(form.fields);
			setLoadedFormId(form.id);
		}
	}, [data]);

	const [updateBookingRequestFields, { loading: saving }] = useMutation(
		FormService.UPDATE_BOOKING_REQUEST_FIELDS
	);

	const showError = (err) => {
		setAlert({
			isAlert: true,
			severity: ALERT_CONSTANTS.SEVERITY.ERROR,
			message: err.graphQLErrors?.[0]?.message || err.message,
			timeout: ALERT_CONSTANTS.TIMEOUT,
			location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
		});
	};

	const showSuccess = (message) => {
		setAlert({
			isAlert: true,
			severity: ALERT_CONSTANTS.SEVERITY.SUCCESS,
			message,
			timeout: ALERT_CONSTANTS.TIMEOUT,
			location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
		});
	};

	// Rules of Hooks: this call MUST happen before the early returns below. useSensors/useSensor
	// call useMemo internally, so gating them behind the loading/not-found checks meant this
	// component called a different number of hooks on the "still loading" render than on the
	// "form loaded" render - React detected the mismatch (`Rendered more hooks than during the
	// previous render`) and crashed the whole editor. Every hook call in a component must run on
	// every render, unconditionally, in the same order - see the same fix in FormBuilder.jsx.
	const sensors = useSensors(
		useSensor(PointerSensor),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
	);

	if (loading && !data) {
		return <IBPageLoader />;
	}
	const form = data?.getForm;
	if (!loading && (!form || form.systemKey !== "booking_request")) {
		return <p className="clientDashboardEmpty">This isn't the booking request form.</p>;
	}

	const handleDragEnd = (event) => {
		const { active, over } = event;
		if (!over || active.id === over.id) {
			return;
		}
		setFields((prev) => {
			const oldIndex = prev.findIndex((f) => f.key === active.id);
			const newIndex = prev.findIndex((f) => f.key === over.id);
			if (oldIndex === -1 || newIndex === -1) {
				return prev;
			}
			return arrayMove(prev, oldIndex, newIndex);
		});
	};

	const updateFieldAt = (key, patch) => {
		setFields((prev) => prev.map((f) => (f.key === key ? { ...f, ...patch } : f)));
	};

	const handleSave = async (e) => {
		e.preventDefault();
		try {
			await updateBookingRequestFields({
				variables: {
					formId,
					fields: fields.map((f) => ({
						key: f.key,
						label: f.label.trim() || f.key,
						required: Boolean(f.required),
						hidden: Boolean(f.hidden),
					})),
				},
			});
			showSuccess("Booking request intake fields saved.");
		} catch (err) {
			showError(err);
		}
	};

	return (
		<div className="formBuilderPage">
			<div className="formBuilderTopRow">
				<h1>Booking Request Fields</h1>
			</div>
			<p className="settingsPanelHelp">
				Reorder, relabel, mark required, or hide the optional questions on your booking request
				page. Name, email, phone, and the description field always show and can't be changed
				here - the booking request pipeline itself is untouched by this panel.
			</p>

			<form onSubmit={handleSave}>
				<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
					<SortableContext items={fields.map((f) => f.key)} strategy={verticalListSortingStrategy}>
						<div className="fieldEditorList">
							{fields.map((field) => (
								<SortableBookingField
									key={field.key}
									field={field}
									onLabelChange={(value) => updateFieldAt(field.key, { label: value })}
									onRequiredChange={(value) => updateFieldAt(field.key, { required: value })}
									onHiddenChange={(value) => updateFieldAt(field.key, { hidden: value })}
								/>
							))}
						</div>
					</SortableContext>
				</DndContext>

				<div className="settingsActions">
					<button type="submit" className="ibButton" disabled={saving}>
						{saving ? "Saving..." : "Save Changes"}
					</button>
					<Button component={RouterLink} to={ROUTE_CONSTANTS.FORMS}>
						Back to Forms
					</Button>
				</div>
			</form>
		</div>
	);
};

export default BookingRequestFieldsEditor;
