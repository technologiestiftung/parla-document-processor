/**
 * This function checks if the provided value is an array.
 * If it is, it joins the array elements into a string separated by commas.
 * If it's not an array but a string, it simply returns the string.
 * If the value is undefined or null, it returns null.
 *
 */
export function checkIfArray(value: string | string[] | undefined | null) {
	if (Array.isArray(value)) {
		return value.join(",");
	}

	return value ?? null;
}
