frappe.pages['inventory-page'].on_page_load = async function(wrapper) {

	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: '',
		single_column: true
	});



	// IMPORTANT: wait for assets to load
	frappe.require([
		'/assets/inventory_vue_app/js/inventory_app.js',
		'/assets/inventory_vue_app/css/inventory_page.css'
	], async () => {

		const html = await frappe.render_template(
			'inventory_page'
		);

		$(page.body).html(html);
		console.log('Assets loaded');

		if (window.start_inventory_app) {
			start_inventory_app();
		} else {
			console.error('start_inventory_app is still undefined');
		}

	});
};

frappe.pages['inventory-page'].on_page_show = function(wrapper) {
	// Hide ERPNext UI when entering the page
	$('.sticky-top, .page-head .body-sidebar-container').hide();
};

frappe.pages['inventory-page'].on_page_hide = function(wrapper) {
	// Show ERPNext UI when leaving the page
	$('.sticky-top, .page-head .body-sidebar-container').show();
};