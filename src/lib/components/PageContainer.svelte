<script context="module">
	//@ts-ignore
	export async function load(params) {
		if (params.params.lunchId) {
			return {
				status: 200
			};
		}
		//TODO check if exists
		return {
			status: 302,
			redirect: '/overview'
		};
	}
</script>

<script lang="ts">
	import { goto } from '$app/navigation';
	import { getUserAsync, mountFamily } from '$lib/stores/userStore';
	import { onMount } from 'svelte';
	onMount(async () => {
		if (!(await getUserAsync())) {
			goto('/login');
		}
		if (!(await mountFamily())) {
			goto('/login');
		}
	});
</script>

<div class="container is-fluid">
	<section class="mt-5"><slot /></section>
</div>

<style>
	@media only screen and (max-width: 600px) {
		.container {
			padding: 0.76rem !important;
		}
	}
</style>
