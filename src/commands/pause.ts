import queueManager from './queueManager';

export async function pauseMusic() {
    queueManager.pause();
}