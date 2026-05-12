
console.log('Loading inventory app...');

window.start_inventory_app = function() {



	console.log('Inventory app started');
	// Load Vue dynamically
	function mount_vue() {

		Vue.createApp({

			data() {
				return {
					title: 'Inventory Page',
					name: ''
				}
			},

			methods: {

				hello() {
					frappe.msgprint(`Hello ${this.name}`);
				}

			}

		}).mount('#inventory-app');
	}

	// If Vue not loaded
	if (!window.Vue) {

		const script = document.createElement('script');

		script.src =
			'https://unpkg.com/vue@3/dist/vue.global.js';

		script.onload = mount_vue;

		document.head.appendChild(script);

	} else {
		mount_vue();
	}
};