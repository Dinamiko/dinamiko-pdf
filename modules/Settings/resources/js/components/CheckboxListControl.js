/**
 * DataForm Edit control for an array field: one checkbox per element.
 */
import {
	BaseControl,
	CheckboxControl,
	VisuallyHidden,
} from '@wordpress/components';

export default function CheckboxListControl( { data, field, onChange } ) {
	const value = field.getValue( { item: data } ) || [];
	const toggle = ( item, checked ) => {
		const next = checked
			? [ ...value, item ]
			: value.filter( ( current ) => current !== item );
		onChange( field.setValue( { item: data, value: next } ) );
	};

	return (
		<fieldset className="dinamiko-pdf-checkbox-list">
			<BaseControl.VisualLabel as="legend">
				{ field.label }
			</BaseControl.VisualLabel>
			{ ( field.elements || [] ).map( ( element ) => (
				<CheckboxControl
					key={ element.value }
					__nextHasNoMarginBottom
					label={ element.label }
					checked={ value.includes( element.value ) }
					onChange={ ( checked ) => toggle( element.value, checked ) }
				/>
			) ) }
			{ field.description && (
				<VisuallyHidden>{ field.description }</VisuallyHidden>
			) }
		</fieldset>
	);
}
