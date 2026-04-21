from kuali_driver import load_courses
import time

def update_cron():
    """
    Update the JSON file with the latest data from the Kuali API.
    This script is ideal to be run as a cron job to keep the data fresh
    and updated regularly.
    """
    try:
        load_courses(force=True)
        print(f"[INFO - {time.strftime('%Y-%m-%d %H:%M:%S')}] Kuali courses updated successfully from cron job.")
    except Exception as e:
        print(f"[ERROR - {time.strftime('%Y-%m-%d %H:%M:%S')}] An error occurred while updating Kuali courses:\n{e}")

if __name__ == "__main__":
    update_cron()