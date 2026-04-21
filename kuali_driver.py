from datetime import datetime
from lxml import html
import requests
import json
import os.path


class Course:
    """
    This class is used to store information about a course. The course will have a title, credit count, and catalog ID.
    The course will also have a list of Cert objects which will contain information about certifications that the course
    is associated with.

    The primary purpose of this class is to store information about a course and the certifications that the course is
    associated with. This class will be used to store course information that is returned from the Kuali API.
    """
    def __init__(self, title, crdts, catalog):
        self.title = title
        self.credits = crdts
        self.catalog = catalog
        self.Certifications = []

    def __str__(self):
        return self.title

    def __repr__(self):
        return self.title

    def add_certification(self, crt):
        self.Certifications.append(crt)


class Cert:
    """
    This class is used to store information about a certification. The certification will have a title, a list of Course
    objects, a provider, and a pid. The Course objects will contain a title, credit count, and catalog ID.
    """
    def __init__(self, title, courses, provider, pid):
        self.title = title
        self.courses = courses  # Expecting list of course objects
        self.provider = provider
        self.pid = pid

    def __str__(self):
        return self.title

    def __repr__(self):
        return self.title


############################################################################################################
# Class independent functions past this point
############################################################################################################

def get_catalog():
    """
    This function will return the catalog ID of the current catalog based on the current date. This is done by
    making a request to the Kuali API and checking the start and end dates of each catalog. If the current date
    is between the start and end date of a catalog, the ID of that catalog is returned.

    :return: The ID of the current catalog as a string
    """
    response = requests.get('https://snhu.kuali.co/api/v1/catalog/public/catalogs/')
    #current date
    date = datetime.now()
    for catalog in response.json():
        # check if date is between start and end date
        if datetime.fromisoformat(catalog['startDate']) < date < datetime.fromisoformat(catalog['endDate']):
            return catalog['_id']


def get_certs():
    """
    This function will return a list of Cert objects. Each Cert object will contain a title, a list of Course objects,
    a provider, and a pid. The Course objects will contain a title, credit count, and catalog ID.

    :return: A list of Cert objects
    """
    catalog = get_catalog()
    response = requests.get('https://snhu.kuali.co/api/v1/catalog/experiences/' + catalog)
    data = response.json()
    certs = []
    for crt in data:
        if crt['title']:
            courses = []
            response = requests.get('https://snhu.kuali.co/api/v1/catalog/experience/' + catalog + '/' + crt['pid'])
            provider = response.json()['groupFilter2']['name']
            course_html = html.fromstring(response.json()['rulesAchievementCriteria'])
            for statement in course_html.xpath("//li[contains(@data-test, 'ruleView-')]"):
                # Extract course code
                course_code = statement.xpath(".//a/text()")[0] if statement.xpath(".//a/text()") else None

                # Extract credit count
                credit_count = statement.xpath(".//span[1]/text()")[0] if statement.xpath(".//span[1]/text()") else None
                if course_code and credit_count:
                    courses.append(Course(course_code, credit_count, catalog))
            certs.append(Cert(crt['title'], courses, provider, crt['pid']))
    return certs


def get_courses():
    """
    This function will return a dictionary of Course objects. Each Course object will contain a title, credit count,
    and catalog ID. The dictionary will be indexed by the course code.

    :return: A dictionary of Course objects
    """

    # Get current catalog. This will check the start and end dates of each catalog and return the ID of the current one.
    catalog = get_catalog()
    # Get certifications associated with catalog
    response = requests.get('https://snhu.kuali.co/api/v1/catalog/experiences/' + catalog)
    data = response.json()
    courses = {}

    # Iterate through each certification found in the catalog
    for crt in data:
        if crt['title']:

            # Get courses associated with certification in raw API return
            response = requests.get('https://snhu.kuali.co/api/v1/catalog/experience/' + catalog + '/' + crt['pid'])

            # Get provider of the certification
            provider = response.json()['groupFilter2']['name']

            # Extract course information from HTML. This is not the HTML of the course page, but the HTML found in the
            # API returned object rulesAchievementCriteria.
            course_html = html.fromstring(response.json()['rulesAchievementCriteria'])

            # Iterate through each course in the certification based on the xpath of the HTML
            for statement in course_html.xpath("//li[contains(@data-test, 'ruleView-')]"):
                # Extract course code
                course_code = statement.xpath(".//a/text()")[0] if statement.xpath(".//a/text()") else None

                # Extract credit count
                credit_count = statement.xpath(".//span[1]/text()")[0] if statement.xpath(".//span[1]/text()") else None

                # Skip if the course code and credit count are not found
                if not course_code and not credit_count:
                    continue

                # Check if course already exists
                if course_code in courses:
                    # Add courses associated with certification
                    certification_to_add = Cert(crt['title'], None, provider, crt['pid'])
                    courses[course_code].add_certification(certification_to_add)
                else:
                    # Course wasn't found, create a new course object
                    course = Course(course_code, credit_count, catalog)
                    certification_to_add = Cert(crt['title'], None, provider, crt['pid'])
                    course.add_certification(certification_to_add)
                    courses[course_code] = course

    return courses

def load_courses(force=False, terminal=False) -> dict:
    """
    This function will check if there is a json file in the repository rss directory called courses.json. If the file exists,
    the function will load the file and return a dictionary of Course objects. If the file does not exist, the function
    will call the get_courses() function to get the courses from the Kuali API and save them to a json file. It will
    also check if the file is older than 24 hours. If the file is older than 24 hours, the function will call the
    get_courses() function to get the courses from the Kuali API and overwrite/write them to the json file.

    :return: A dictionary of Course objects
    """

    # Cache is always stored in the project rss folder for static site compatibility.
    project_root = os.path.dirname(os.path.abspath(__file__))
    rss_path = os.path.join(project_root, 'rss')
    if not os.path.exists(rss_path):
        os.makedirs(rss_path)

    # Check if the file exists
    json_path = os.path.join(rss_path, 'courses.json')
    if os.path.exists(json_path) or force:

        if not force:
            # Check when courses.json was last modified
            last_modified = datetime.fromtimestamp(os.path.getmtime(json_path))
        else:
            # If force is True, we will not check the last modified time
            last_modified = datetime.min

        # If the file was modified in the last 24 hours, load the file
        if (datetime.now() - last_modified).total_seconds() < 86400 and not force:
            # Load the file reading the json file
            try:
                with open(json_path, 'r') as f:
                    data = json.load(f)
                    courses = {}
                    for course_code, course_data in data.items():
                        course = Course(course_data['title'], course_data['credits'], course_data['catalog'])
                        for cert_data in course_data['Certifications']:
                            certificate = Cert(cert_data['title'], None, cert_data['provider'], cert_data['pid'])
                            course.add_certification(certificate)
                        courses[course_code] = course
                return courses
            except json.JSONDecodeError as e:
                print(f"Error decoding JSON: {e}. Re-fetching data from Kuali API.")
                os.remove(json_path)

    # Get the courses from the Kuali API
    courses = get_courses()

    # Save the courses to a json file
    with open(json_path, 'w') as f:
        data = {}
        for course_code, course in courses.items():
            data[course_code] = {
                'title': course.title,
                'credits': course.credits,
                'catalog': course.catalog,
                'Certifications': []
            }
            for certificate in course.Certifications:
                data[course_code]['Certifications'].append({
                    'title': certificate.title,
                    'provider': certificate.provider,
                    'pid': certificate.pid
                })
        json.dump(data, f)

    return courses

def sanitize_input(input_value):
    """
    Sanitize the input value to prevent XSS attacks.
    :param input_value: The input value to sanitize.
    :return: Sanitized input value.
    """
    if not input_value:
        return ""

    input_value = input_value.replace(" ", "") # Remove spaces
    input_value = input_value.replace("-", "") # Remove hyphens
    input_value = input_value.replace("_", "") # Remove underscores
    return input_value.strip().upper() # Strip leading and trailing whitespace of all kinds


if __name__ == "__main__":
    print("Acquiring course information... Please wait.")
    crses = load_courses(terminal=True)
    while True:
        course_to_match = input("\nRespond with 'exit' to leave the program.\n"
                                "Enter a course code to find associated certifications: ")
        course_to_match = sanitize_input(course_to_match)

        if course_to_match.lower() == 'exit':
            break
        elif course_to_match in crses:
            print(f"Certifications associated with {course_to_match}:")
            for cert in crses[course_to_match].Certifications:
                print(f"\tProvider: {str.strip(cert.provider)} | Certification: {str.strip(cert.title)}")
        else:
            print(f"No certifications found for course {course_to_match}")
