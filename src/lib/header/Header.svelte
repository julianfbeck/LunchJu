<script lang="ts">
	import { goto } from '$app/navigation';

	import { page } from '$app/stores';
	import { getUserAsync, resetUser, signOut } from '$lib/stores/userStore';
	import { SvelteToast } from '@zerodevx/svelte-toast';
	import { t } from '$lib/helpers/i18n';
	let mobile: any;
	const toggleNav = () => {
		mobile = !mobile;
	};

	async function handleSignout() {
		await signOut();
		resetUser();
		goto('/login');
	}

	async function userLoggedIn() {
		const user = await getUserAsync();
		return user !== undefined;
	}
</script>

<div>
	<nav class="navbar ">
		<!--Logo-->
		<div class="navbar-brand">
			<a href="/overview" class="navbar-item" style="font-weight:800">LunchJu</a>
			<a class="navbar-burger" class:is-active={mobile} id="burger" on:click={toggleNav}>
				<span />
				<span />
				<span />
			</a>
		</div>
		<!--Items-->
		<div class="navbar-menu" class:is-active={mobile} id="menu">
			<div class="navbar-start">
				<a
					class="navbar-item"
					class:is-active={$page.url.pathname === '/overview'}
					sveltekit:prefetch
					href="/overview">
					{$t('overview')}
				</a>
				<!--Item-->
				<a
					class="navbar-item"
					class:is-active={$page.url.pathname === '/stats'}
					sveltekit:prefetch
					href="/stats">
					{$t('statistic')}
				</a>
				<!--Item-->
			</div>
		</div>
		<div class="navbar-menu" class:is-active={mobile} id="menu">
			<div class="navbar-end">
				<a
					class="navbar-item"
					class:is-active={$page.url.pathname === '/about'}
					sveltekit:prefetch
					href="/about">
					{$t('about')}
				</a>
				{#await userLoggedIn()}
					Loading...
				{:then user}
					{#if !user}
						<a
							class="navbar-item"
							class:is-active={$page.url.pathname === '/login'}
							sveltekit:prefetch
							href="/login">
							{$t('login')}
						</a>
					{:else}
						<a class="navbar-item" on:click|once={handleSignout}> {$t('log-out')} </a>
					{/if}
				{:catch someError}
					System error: {someError.message}.
				{/await}
			</div>
		</div>
	</nav>
	<SvelteToast />
</div>
